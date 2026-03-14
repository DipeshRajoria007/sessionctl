import Foundation
import SwiftUI

enum ShellType: String, Sendable {
    case zsh, bash, fish
}

enum ToolType: String, Sendable, CaseIterable {
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

    var displayColor: Color {
        switch self {
        case .claude: return Color(red: 0x8B/255, green: 0x5C/255, blue: 0xF6/255)  // #8B5CF6
        case .codex:  return Color(red: 0x10/255, green: 0xB9/255, blue: 0x81/255)  // #10B981
        case .aider:  return Color(red: 0xF5/255, green: 0x9E/255, blue: 0x0B/255)  // #F59E0B
        case .git:    return Color(red: 0xEF/255, green: 0x44/255, blue: 0x44/255)  // #EF4444
        case .npm:    return Color(red: 0xEA/255, green: 0xB3/255, blue: 0x08/255)  // #EAB308
        case .other:  return Color(red: 0x6B/255, green: 0x72/255, blue: 0x80/255)  // #6B7280
        case .none:   return Color(red: 0x6B/255, green: 0x72/255, blue: 0x80/255)  // #6B7280
        }
    }

    var displayName: String {
        switch self {
        case .claude: return "claude"
        case .codex:  return "codex"
        case .aider:  return "aider"
        case .git:    return "git"
        case .npm:    return "npm"
        case .other:  return "shell"
        case .none:   return "shell"
        }
    }
}

enum SessionStatus: String, Sendable {
    case idle, running, exited
}

struct Session: Identifiable, Sendable {
    let id: UUID
    var shellPID: pid_t
    var shellType: ShellType
    var repoRoot: String?
    var repoName: String?
    var branch: String?
    var tool: ToolType
    var foregroundProcess: String?
    var status: SessionStatus
    var directory: String?
    var startingDirectory: String?
    var createdAt: Date

    init(id: UUID = UUID(), shellPID: pid_t = 0, shellType: ShellType = .zsh, startingDirectory: String? = nil) {
        self.id = id
        self.shellPID = shellPID
        self.shellType = shellType
        self.tool = .none
        self.status = .idle
        self.startingDirectory = startingDirectory
        self.directory = startingDirectory
        self.createdAt = Date()
    }

    var displayTitle: String {
        if let name = repoName {
            if let branch = branch {
                return "\(name)/\(branch)"
            }
            return name
        }
        if let dir = directory {
            return (dir as NSString).lastPathComponent
        }
        return "shell"
    }
}

struct SessionGroup: Identifiable, Sendable {
    var id: String { repoRoot ?? "ungrouped" }
    var repoRoot: String?
    var repoName: String?
    var sessions: [Session]
}

struct AppState: Sendable {
    var groups: [SessionGroup]
    var ungrouped: [Session]
    var totalCount: Int

    static let empty = AppState(groups: [], ungrouped: [], totalCount: 0)
}
