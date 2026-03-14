import Foundation

struct SessionDefinition: Codable, Identifiable, Sendable {
    var id: String { repoPath }
    var repoPath: String
    var startupCommand: String?
}

struct Workspace: Codable, Identifiable, Sendable {
    var id: String
    var name: String
    var sessions: [SessionDefinition]
    var createdAt: Date
    var lastRestoredAt: Date?
}
