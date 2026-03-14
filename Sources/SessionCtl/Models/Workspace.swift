import Foundation

struct SessionDefinition: Codable, Identifiable, Sendable {
    var id: String { repoPath }
    var repoPath: String
    var startupCommand: String?
    var terminalApp: TerminalAppType
    var windowPreference: WindowPreference

    enum WindowPreference: String, Codable, Sendable {
        case newWindow = "new-window"
        case newTab = "new-tab"
    }
}

struct Workspace: Codable, Identifiable, Sendable {
    var id: String
    var name: String
    var sessions: [SessionDefinition]
    var createdAt: Date
    var lastRestoredAt: Date?
}
