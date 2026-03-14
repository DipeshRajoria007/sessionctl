import SwiftUI

struct WorkspacePanelView: View {
    let onDismiss: () -> Void
    @EnvironmentObject var workspaceManager: WorkspaceManager
    @EnvironmentObject var sessionStore: SessionStore
    @State private var newWorkspaceName = ""
    @State private var showSaveField = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if workspaceManager.workspaces.isEmpty && !showSaveField {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "square.stack.3d.up.slash")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("No saved workspaces")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Save your current session layout to restore it later.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(workspaceManager.workspaces) { workspace in
                            WorkspaceRowView(workspace: workspace)
                        }
                    }
                    .padding(12)
                }
            }

            Divider()

            // Save controls
            if showSaveField {
                HStack(spacing: 6) {
                    TextField("Workspace name", text: $newWorkspaceName)
                        .textFieldStyle(.roundedBorder)
                        .font(.subheadline)
                    Button("Save") { saveWorkspace() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(newWorkspaceName.isEmpty)
                    Button("Cancel") {
                        showSaveField = false
                        newWorkspaceName = ""
                    }
                    .controlSize(.small)
                }
                .padding(10)
            } else {
                Button(action: { showSaveField = true }) {
                    Label("Save Current Layout", systemImage: "square.and.arrow.down")
                        .font(.subheadline)
                }
                .buttonStyle(.plain)
                .disabled(sessionStore.sessions.isEmpty)
                .padding(10)
            }
        }
    }

    private func saveWorkspace() {
        guard !newWorkspaceName.isEmpty else { return }
        let sessions = Array(sessionStore.sessions.values)
        _ = workspaceManager.saveCurrentSessions(sessions, name: newWorkspaceName)
        newWorkspaceName = ""
        showSaveField = false
    }
}

struct WorkspaceRowView: View {
    let workspace: Workspace
    @EnvironmentObject var workspaceManager: WorkspaceManager

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(workspace.name)
                    .font(.subheadline.weight(.medium))
                Text("\(workspace.sessions.count) sessions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button("Restore") { restoreWorkspace() }
                .font(.caption)
                .buttonStyle(.bordered)
                .controlSize(.small)

            Button(action: { workspaceManager.delete(workspace.id) }) {
                Image(systemName: "trash")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            .buttonStyle(.plain)
        }
        .padding(8)
        .background(.quaternary.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func restoreWorkspace() {
        Task {
            for sessionDef in workspace.sessions {
                let adapter = adapterFor(sessionDef.terminalApp)
                try? await adapter.launchSession(sessionDef)
                try? await Task.sleep(for: .milliseconds(500))
            }
            await MainActor.run {
                workspaceManager.markRestored(workspace.id)
            }
        }
    }
}
