import Foundation

struct SessionEvent: Codable, Sendable {
    let type: String
    let sessionId: String
    var tty: String?
    var pid: Int?
    var shellType: String?
    var initialDirectory: String?
    var directory: String?
    var repoRoot: String?
    var repoName: String?
    var branch: String?
    var command: String?
    var tool: String?
    var exitStatus: Int?
    var duration: Double?
}
