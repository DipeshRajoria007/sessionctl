import SwiftUI

struct NewSessionView: View {
    let onDismiss: () -> Void
    @State private var repoPath = ""
    @State private var startupCommand = ""
    @State private var terminalApp: TerminalAppType = .iterm2
    @State private var windowPreference: SessionDefinition.WindowPreference = .newTab
    @State private var errorMessage: String?
    @State private var isLaunching = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Repository Path")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    TextField("/path/to/repo", text: $repoPath)
                        .textFieldStyle(.roundedBorder)
                        .font(.subheadline)
                    Button(action: pickDirectory) {
                        Image(systemName: "folder")
                    }
                    .buttonStyle(.bordered)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Startup Command")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                TextField("e.g. claude, npm run dev", text: $startupCommand)
                    .textFieldStyle(.roundedBorder)
                    .font(.subheadline)
            }

            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Terminal")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    Picker("", selection: $terminalApp) {
                        Text("iTerm2").tag(TerminalAppType.iterm2)
                        Text("Terminal").tag(TerminalAppType.terminal)
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Open In")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    Picker("", selection: $windowPreference) {
                        Text("Tab").tag(SessionDefinition.WindowPreference.newTab)
                        Text("Window").tag(SessionDefinition.WindowPreference.newWindow)
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                }
            }

            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Spacer()

            HStack {
                Spacer()
                Button("Launch") {
                    launchSession()
                }
                .buttonStyle(.borderedProminent)
                .disabled(repoPath.isEmpty || isLaunching)
                .keyboardShortcut(.return)
            }
        }
        .padding(16)
    }

    private func pickDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            repoPath = url.path
        }
    }

    private func launchSession() {
        guard !repoPath.isEmpty else { return }

        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: repoPath, isDirectory: &isDir),
              isDir.boolValue else {
            errorMessage = "Directory does not exist"
            return
        }

        isLaunching = true
        errorMessage = nil

        let def = SessionDefinition(
            repoPath: repoPath,
            startupCommand: startupCommand.isEmpty ? nil : startupCommand,
            terminalApp: terminalApp,
            windowPreference: windowPreference
        )

        Task {
            let adapter = adapterFor(terminalApp)
            do {
                try await adapter.launchSession(def)
                await MainActor.run { onDismiss() }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLaunching = false
                }
            }
        }
    }
}
