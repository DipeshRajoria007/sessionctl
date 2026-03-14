import Foundation
import SwiftUI

@MainActor
class SessionStore: ObservableObject {
    @Published var sessions: [String: Session] = [:]
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
                (session.currentCommand?.lowercased().contains(query) ?? false)
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

        let groups = grouped.map { root, sessions in
            SessionGroup(
                repoRoot: root,
                repoName: sessions.first?.repoName,
                sessions: sessions.sorted { $0.lastSeenAt > $1.lastSeenAt }
            )
        }.sorted { $0.mostRecentActivity > $1.mostRecentActivity }

        return AppState(
            groups: groups,
            ungrouped: ungrouped.sorted { $0.lastSeenAt > $1.lastSeenAt },
            totalCount: filtered.count
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

    func handleEvent(_ event: SessionEvent) {
        let now = Date()

        switch event.type {
        case "session_init":
            let session = Session(
                id: event.sessionId,
                tty: event.tty ?? "",
                pid: event.pid ?? 0,
                shellType: ShellType(rawValue: event.shellType ?? "zsh") ?? .zsh,
                status: .idle,
                terminalApp: .unknown,
                mode: .attached,
                lastSeenAt: now,
                createdAt: now,
                directory: event.initialDirectory
            )
            sessions[event.sessionId] = session

        case "directory_changed":
            guard var session = sessions[event.sessionId] else { return }
            session.directory = event.directory
            session.repoRoot = event.repoRoot
            session.repoName = event.repoName
            session.branch = event.branch
            session.lastSeenAt = now
            sessions[event.sessionId] = session

        case "command_start":
            guard var session = sessions[event.sessionId] else { return }
            session.currentCommand = event.command
            session.tool = ToolType(rawValue: event.tool ?? "other") ?? .other
            session.status = .running
            session.lastSeenAt = now
            sessions[event.sessionId] = session

        case "command_end":
            guard var session = sessions[event.sessionId] else { return }
            session.currentCommand = nil
            session.status = .idle
            session.lastSeenAt = now
            sessions[event.sessionId] = session

        case "session_exit":
            guard var session = sessions[event.sessionId] else { return }
            session.status = .exited
            session.lastSeenAt = now
            sessions[event.sessionId] = session
            let id = event.sessionId
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(2))
                self.sessions.removeValue(forKey: id)
            }

        default:
            break
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
