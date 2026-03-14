import Foundation
import SwiftUI

@MainActor
class WorkspaceManager: ObservableObject {
    @Published var workspaces: [Workspace] = []

    private let filePath: String
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }()

    init() {
        self.filePath = NSHomeDirectory() + "/.sessionctl/workspaces.json"
        load()
    }

    func load() {
        guard let data = FileManager.default.contents(atPath: filePath),
              let loaded = try? decoder.decode([Workspace].self, from: data) else { return }
        workspaces = loaded
    }

    func save(_ workspace: Workspace) {
        if let idx = workspaces.firstIndex(where: { $0.name == workspace.name }) {
            workspaces[idx] = workspace
        } else {
            workspaces.append(workspace)
        }
        persist()
    }

    func saveCurrentSessions(_ sessions: [Session], name: String) -> Workspace {
        let defs = sessions.compactMap { session -> SessionDefinition? in
            guard let repoPath = session.repoRoot else { return nil }
            return SessionDefinition(
                repoPath: repoPath,
                startupCommand: nil
            )
        }

        let workspace = Workspace(
            id: UUID().uuidString,
            name: name,
            sessions: defs,
            createdAt: Date(),
            lastRestoredAt: nil
        )
        save(workspace)
        return workspace
    }

    func delete(_ id: String) {
        workspaces.removeAll { $0.id == id }
        persist()
    }

    func markRestored(_ id: String) {
        guard let idx = workspaces.firstIndex(where: { $0.id == id }) else { return }
        workspaces[idx].lastRestoredAt = Date()
        persist()
    }

    private func persist() {
        guard let data = try? encoder.encode(workspaces) else { return }
        let dir = (filePath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)

        let tempPath = filePath + ".tmp"
        FileManager.default.createFile(atPath: tempPath, contents: data)
        try? FileManager.default.removeItem(atPath: filePath)
        try? FileManager.default.moveItem(atPath: tempPath, toPath: filePath)
    }
}
