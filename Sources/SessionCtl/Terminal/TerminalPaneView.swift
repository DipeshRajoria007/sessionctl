import SwiftUI

struct TerminalPaneView: View {
    let sessionID: UUID
    @EnvironmentObject var sessionStore: SessionStore
    @EnvironmentObject var splitManager: SplitManager

    private var session: Session? {
        sessionStore.session(for: sessionID)
    }

    private var isSelected: Bool {
        splitManager.selectedPaneSessionID == sessionID
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header bar
            headerBar

            // Terminal view
            TerminalSessionView(
                sessionID: sessionID,
                startingDirectory: session?.startingDirectory,
                onShellPID: { pid in
                    if let appDelegate = NSApp.delegate as? AppDelegate {
                        appDelegate.registerShellPID(sessionID: sessionID, pid: pid)
                    }
                },
                onDirectoryChange: { dir in
                    Task { @MainActor in
                        sessionStore.handleDirectoryChange(id: sessionID, directory: dir)
                    }
                },
                onTerminated: {
                    Task { @MainActor in
                        splitManager.closePane(sessionID: sessionID)
                        sessionStore.closeSession(id: sessionID)
                    }
                }
            )
            .onTapGesture {
                splitManager.selectedPaneSessionID = sessionID
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 0)
                .stroke(isSelected ? (session?.tool.displayColor ?? .gray) : .clear, lineWidth: 2)
        )
    }

    private var headerBar: some View {
        HStack(spacing: 8) {
            // Color dot
            Circle()
                .fill(session?.tool.displayColor ?? ToolType.none.displayColor)
                .frame(width: 8, height: 8)

            // Tool name
            Text(session?.tool.displayName ?? "shell")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)

            if let title = session?.displayTitle {
                Text(title)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.tertiary)
            }

            if let fg = session?.foregroundProcess {
                Text(fg)
                    .font(.system(size: 11, weight: .regular, design: .monospaced))
                    .foregroundStyle(.quaternary)
            }

            Spacer()

            // Close button
            Button(action: {
                splitManager.closePane(sessionID: sessionID)
                sessionStore.closeSession(id: sessionID)
            }) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(session?.tool.displayColor.opacity(0.1) ?? Color.gray.opacity(0.1))
    }
}
