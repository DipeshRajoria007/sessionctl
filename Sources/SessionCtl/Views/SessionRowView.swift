import SwiftUI

struct SessionRowView: View {
    let session: Session
    let index: Int
    @EnvironmentObject var sessionStore: SessionStore

    private var statusColor: Color {
        switch session.status {
        case .running: return .green
        case .idle: return .yellow
        case .exited: return .red
        }
    }

    private var toolLabel: String {
        if let tool = session.tool, tool != .none, tool != .other {
            return tool.rawValue
        }
        if let fg = session.foregroundProcess, !fg.isEmpty {
            return fg
        }
        return "idle"
    }

    private var toolBadgeColor: Color {
        if let tool = session.tool {
            switch tool {
            case .claude: return .purple
            case .codex: return .orange
            case .aider: return .green
            case .git: return .red
            case .npm: return .yellow
            case .other, .none: return .blue
            }
        }
        return .secondary
    }

    private var primaryLabel: String {
        if let name = session.repoName {
            return name
        }
        if let dir = session.directory {
            return (dir as NSString).lastPathComponent
        }
        return session.tty
    }

    private var terminalIcon: String {
        switch session.terminalApp {
        case .iterm2: return "rectangle.topthird.inset.filled"
        case .terminal, .unknown: return "terminal"
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 6, height: 6)

            Text("\(index)")
                .font(.caption2.monospaced())
                .foregroundStyle(.tertiary)
                .frame(width: 14)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(primaryLabel)
                        .font(.caption.weight(.medium))
                        .lineLimit(1)

                    if let branch = session.branch, !branch.isEmpty {
                        Image(systemName: "arrow.triangle.branch")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(branch)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                HStack(spacing: 4) {
                    Text(toolLabel)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(toolBadgeColor.opacity(0.15))
                        .foregroundStyle(toolBadgeColor)
                        .clipShape(RoundedRectangle(cornerRadius: 3))

                    if let cmd = session.currentCommand {
                        Text(cmd)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    } else if let windowName = session.windowName, !windowName.isEmpty {
                        Text(windowName)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            if session.dataSource == .merged {
                Image(systemName: "link.circle.fill")
                    .font(.caption2)
                    .foregroundStyle(.green.opacity(0.6))
                    .help("Shell companion active")
            }

            Image(systemName: terminalIcon)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.leading, 20)
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .onTapGesture {
            focusSession()
        }
        .contextMenu {
            Button("Focus") { focusSession() }
            Button("Close Session") { closeSession() }
            Divider()
            if let path = session.repoRoot ?? session.directory {
                Button("Copy Path") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(path, forType: .string)
                }
            }
            Button("Remove from List", role: .destructive) {
                sessionStore.removeSession(session.id)
            }
        }
    }

    private func focusSession() {
        Task {
            let adapter = adapterFor(session.terminalApp)
            try? await adapter.focusSession(tty: session.tty)
        }
    }

    private func closeSession() {
        Task {
            let adapter = adapterFor(session.terminalApp)
            try? await adapter.closeSession(tty: session.tty)
            await MainActor.run {
                sessionStore.removeSession(session.id)
            }
        }
    }
}
