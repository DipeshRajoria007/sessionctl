import Foundation

enum ShellType: String, Codable, Sendable {
    case zsh, bash
}

enum ToolType: String, Codable, Sendable {
    case claude, codex, aider, git, npm, other, none
}

enum SessionStatus: String, Codable, Sendable {
    case idle, running, exited
}

enum TerminalAppType: String, Codable, Sendable {
    case iterm2, terminal, unknown
}

enum SessionMode: String, Codable, Sendable {
    case managed, attached
}

struct Session: Identifiable, Codable, Sendable {
    var id: String
    var tty: String
    var pid: Int
    var shellType: ShellType
    var repoRoot: String?
    var repoName: String?
    var branch: String?
    var tool: ToolType?
    var currentCommand: String?
    var status: SessionStatus
    var terminalApp: TerminalAppType
    var mode: SessionMode
    var lastSeenAt: Date
    var createdAt: Date
    var directory: String?
}

struct SessionGroup: Identifiable, Sendable {
    var id: String { repoRoot ?? "ungrouped" }
    var repoRoot: String?
    var repoName: String?
    var sessions: [Session]

    var mostRecentActivity: Date {
        sessions.map(\.lastSeenAt).max() ?? .distantPast
    }
}

struct AppState: Sendable {
    var groups: [SessionGroup]
    var ungrouped: [Session]
    var totalCount: Int

    static let empty = AppState(groups: [], ungrouped: [], totalCount: 0)
}
