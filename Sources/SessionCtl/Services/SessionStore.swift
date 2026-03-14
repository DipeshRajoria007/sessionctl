import Foundation
import SwiftUI

@MainActor
class SessionStore: ObservableObject {
    @Published var sessions: [UUID: Session] = [:]
    @Published var searchQuery: String = ""

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
                session.tool.rawValue.lowercased().contains(query) ||
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

        let sortByCreation: ([Session]) -> [Session] = { sessions in
            sessions.sorted { $0.createdAt < $1.createdAt }
        }

        let groups = grouped.map { root, sessions in
            SessionGroup(
                repoRoot: root,
                repoName: sessions.first?.repoName,
                sessions: sortByCreation(sessions)
            )
        }.sorted { ($0.repoName ?? "") < ($1.repoName ?? "") }

        return AppState(
            groups: groups,
            ungrouped: sortByCreation(ungrouped),
            totalCount: filtered.count
        )
    }

    // MARK: - Session Lifecycle

    @discardableResult
    func createSession(directory: String? = nil) -> UUID {
        let session = Session(startingDirectory: directory)
        sessions[session.id] = session
        return session.id
    }

    func closeSession(id: UUID) {
        sessions.removeValue(forKey: id)
    }

    func updateShellPID(_ id: UUID, pid: pid_t) {
        sessions[id]?.shellPID = pid
    }

    // MARK: - Process Monitor Updates

    struct ProcessUpdate {
        let foregroundProcess: String?
        let tool: ToolType
        let status: SessionStatus
    }

    struct GitUpdate {
        let directory: String?
        let repoRoot: String?
        let repoName: String?
        let branch: String?
    }

    func handleProcessUpdate(id: UUID, update: ProcessUpdate) {
        guard sessions[id] != nil else { return }
        sessions[id]?.foregroundProcess = update.foregroundProcess
        sessions[id]?.tool = update.tool
        sessions[id]?.status = update.status
    }

    func handleGitUpdate(id: UUID, update: GitUpdate) {
        guard sessions[id] != nil else { return }
        sessions[id]?.directory = update.directory
        sessions[id]?.repoRoot = update.repoRoot
        sessions[id]?.repoName = update.repoName
        sessions[id]?.branch = update.branch
    }

    func handleDirectoryChange(id: UUID, directory: String) {
        guard sessions[id] != nil else { return }
        sessions[id]?.directory = directory
    }

    func session(for id: UUID) -> Session? {
        sessions[id]
    }

    var allSessions: [Session] {
        Array(sessions.values).sorted { $0.createdAt < $1.createdAt }
    }
}
