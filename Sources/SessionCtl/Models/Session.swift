import Foundation

enum ShellType: String, Codable, Sendable {
    case zsh, bash
}

enum ToolType: String, Codable, Sendable {
    case claude, codex, aider, git, npm, other, none

    static func fromProcessName(_ name: String) -> ToolType {
        switch name.lowercased() {
        case "claude", "claude-code": return .claude
        case "codex": return .codex
        case "aider": return .aider
        case "git": return .git
        case "npm", "npx", "yarn", "pnpm", "node": return .npm
        default: return .other
        }
    }
}

enum SessionStatus: String, Codable, Sendable {
    case idle, running, exited
}

enum TerminalAppType: String, Codable, Sendable {
    case iterm2, terminal, unknown
}

enum DataSource: String, Codable, Sendable {
    case discovered   // from TerminalScanner polling
    case companion    // from shell companion socket
    case merged       // both sources
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
    var dataSource: DataSource
    var lastSeenAt: Date
    var createdAt: Date
    var directory: String?
    var foregroundProcess: String?
    var windowName: String?
    var windowIndex: Int?
    var tabIndex: Int?
    var isBusy: Bool
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
    var companionCount: Int

    static let empty = AppState(groups: [], ungrouped: [], totalCount: 0, companionCount: 0)
}
