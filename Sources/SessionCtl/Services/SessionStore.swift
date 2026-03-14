import Foundation
import SwiftUI

@MainActor
class SessionStore: ObservableObject {
    @Published var sessions: [String: Session] = [:]  // keyed by TTY
    @Published var searchQuery: String = ""

    private let stalenessTimeout: TimeInterval = 300
    private var pruneTimer: Timer?

    var appState: AppState {
        let activeSessions = sessions.values.filter { $0.status != .exited }

        let filtered: [Session]
        if searchQuery.isEmpty {
            filtered = Array(activeSessions)
        } else {
            let query = searchQuery.lowercased()
            filtered = activeSessions.filter { session in
                (session.repoName?.lowercased().contains(query) ?? false) ||
                (session.branch?.lowercased().contains(query) ?? false) ||
                (session.tool?.rawValue.lowercased().contains(query) ?? false) ||
                (session.currentCommand?.lowercased().contains(query) ?? false) ||
                (session.foregroundProcess?.lowercased().contains(query) ?? false) ||
                (session.directory?.lowercased().contains(query) ?? false)
            }
        }

        var grouped: [String: [Session]] = [:]
        var ungrouped: [Session] = []

        for session in filtered {
            if let root = session.repoRoot {
                grouped[root, default: []].append(session)
            } else {
                ungrouped.append(session)
            }
        }

        let sortByTabOrder: ([Session]) -> [Session] = { sessions in
            sessions.sorted { a, b in
                if let aw = a.windowIndex, let bw = b.windowIndex, aw != bw {
                    return aw < bw
                }
                if let at = a.tabIndex, let bt = b.tabIndex {
                    return at < bt
                }
                return a.lastSeenAt > b.lastSeenAt
            }
        }

        let groups = grouped.map { root, sessions in
            SessionGroup(
                repoRoot: root,
                repoName: sessions.first?.repoName,
                sessions: sortByTabOrder(sessions)
            )
        }.sorted { $0.mostRecentActivity > $1.mostRecentActivity }

        let companionCount = filtered.filter { $0.dataSource == .companion || $0.dataSource == .merged }.count

        return AppState(
            groups: groups,
            ungrouped: sortByTabOrder(ungrouped),
            totalCount: filtered.count,
            companionCount: companionCount
        )
    }

    func startPruning() {
        pruneTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.pruneStaleSessions()
            }
        }
    }

    func stopPruning() {
        pruneTimer?.invalidate()
        pruneTimer = nil
    }

    // MARK: - Companion Events (socket)

    func handleEvent(_ event: SessionEvent) {
        let now = Date()
        // The companion now sends TTY as sessionId directly
        let tty = event.tty ?? event.sessionId

        switch event.type {
        case "session_init":
            if var existing = sessions[tty] {
                // Merge: upgrade to .merged
                existing.dataSource = .merged
                existing.pid = event.pid ?? existing.pid
                existing.shellType = ShellType(rawValue: event.shellType ?? "zsh") ?? existing.shellType
                existing.directory = event.initialDirectory ?? existing.directory
                existing.lastSeenAt = now
                sessions[tty] = existing
            } else {
                let session = Session(
                    id: tty,
                    tty: tty,
                    pid: event.pid ?? 0,
                    shellType: ShellType(rawValue: event.shellType ?? "zsh") ?? .zsh,
                    status: .idle,
                    terminalApp: .unknown,
                    dataSource: .companion,
                    lastSeenAt: now,
                    createdAt: now,
                    directory: event.initialDirectory,
                    isBusy: false
                )
                sessions[tty] = session
            }

        case "directory_changed":
            guard var session = sessions[tty] else { return }
            session.directory = event.directory
            session.repoRoot = event.repoRoot
            session.repoName = event.repoName
            session.branch = event.branch
            session.lastSeenAt = now
            sessions[tty] = session

        case "command_start":
            guard var session = sessions[tty] else { return }
            session.currentCommand = event.command
            session.tool = ToolType(rawValue: event.tool ?? "other") ?? .other
            session.status = .running
            session.isBusy = true
            session.lastSeenAt = now
            sessions[tty] = session

        case "command_end":
            guard var session = sessions[tty] else { return }
            session.currentCommand = nil
            session.status = .idle
            session.isBusy = false
            session.lastSeenAt = now
            sessions[tty] = session

        case "session_exit":
            guard var session = sessions[tty] else { return }
            session.status = .exited
            session.lastSeenAt = now
            sessions[tty] = session
            let key = tty
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(2))
                self.sessions.removeValue(forKey: key)
            }

        default:
            break
        }
    }

    // MARK: - Discovery Merge

    func mergeDiscoveredSessions(_ discovered: [DiscoveredSession]) {
        let now = Date()
        let discoveredTTYs = Set(discovered.map(\.tty))

        // Remove sessions that are no longer discovered (tab was closed)
        // Only remove discovered-only sessions; keep companion-only sessions (they self-manage)
        let keysToRemove = sessions.keys.filter { tty in
            !discoveredTTYs.contains(tty) && sessions[tty]?.dataSource == .discovered
        }
        for key in keysToRemove {
            sessions.removeValue(forKey: key)
        }

        for disc in discovered {
            if var existing = sessions[disc.tty] {
                // Merge discovered data into existing session
                existing.terminalApp = disc.terminalApp
                existing.windowIndex = disc.windowIndex
                existing.tabIndex = disc.tabIndex
                existing.windowName = disc.windowName
                existing.lastSeenAt = now

                // Discovered provides CWD/git when companion hasn't set them
                if existing.dataSource == .discovered || existing.directory == nil {
                    existing.directory = disc.directory
                }
                if existing.dataSource == .discovered || existing.repoRoot == nil {
                    existing.repoRoot = disc.repoRoot
                    existing.repoName = disc.repoName
                    existing.branch = disc.branch
                }

                // Foreground process from discovery
                existing.foregroundProcess = disc.foregroundProcess
                existing.pid = disc.pid

                // Busy state: companion is authoritative when merged, discovery otherwise
                if existing.dataSource == .discovered {
                    existing.isBusy = disc.isBusy
                }

                // Tool from process name when companion hasn't set one
                if existing.dataSource == .discovered, !disc.foregroundProcess.isEmpty {
                    existing.tool = ToolType.fromProcessName(disc.foregroundProcess)
                    existing.status = .running
                } else if existing.dataSource == .discovered {
                    existing.tool = nil
                    existing.status = .idle
                }

                if existing.dataSource == .companion {
                    existing.dataSource = .merged
                }

                sessions[disc.tty] = existing
            } else {
                // New discovered session
                let isShell = disc.foregroundProcess.isEmpty
                let tool: ToolType? = isShell ? nil : ToolType.fromProcessName(disc.foregroundProcess)

                let session = Session(
                    id: disc.tty,
                    tty: disc.tty,
                    pid: disc.pid,
                    shellType: .zsh,
                    repoRoot: disc.repoRoot,
                    repoName: disc.repoName,
                    branch: disc.branch,
                    tool: tool,
                    status: isShell ? .idle : .running,
                    terminalApp: disc.terminalApp,
                    dataSource: .discovered,
                    lastSeenAt: now,
                    createdAt: now,
                    directory: disc.directory,
                    foregroundProcess: disc.foregroundProcess,
                    windowName: disc.windowName,
                    windowIndex: disc.windowIndex,
                    tabIndex: disc.tabIndex,
                    isBusy: disc.isBusy
                )
                sessions[disc.tty] = session
            }
        }
    }

    func removeSession(_ id: String) {
        sessions.removeValue(forKey: id)
    }

    private func pruneStaleSessions() {
        let cutoff = Date().addingTimeInterval(-stalenessTimeout)
        let staleKeys = sessions.filter { $0.value.lastSeenAt < cutoff }.map(\.key)
        for key in staleKeys {
            sessions.removeValue(forKey: key)
        }
    }
}
