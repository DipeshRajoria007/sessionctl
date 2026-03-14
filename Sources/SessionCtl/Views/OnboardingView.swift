import SwiftUI

struct OnboardingView: View {
    let onDismiss: () -> Void
    @EnvironmentObject var sessionStore: SessionStore
    @State private var step = 0
    @State private var detectedShell = "zsh"

    var body: some View {
        VStack(spacing: 0) {
            switch step {
            case 0: welcomeStep
            case 1: companionStep
            case 2: doneStep
            default: doneStep
            }
        }
        .padding(16)
        .onAppear {
            if ProcessInfo.processInfo.environment["SHELL"]?.contains("bash") == true {
                detectedShell = "bash"
            }
        }
    }

    private var welcomeStep: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "terminal.fill")
                .font(.system(size: 40))
                .foregroundStyle(.blue)
            Text("Welcome to SessionCtl")
                .font(.title3.weight(.semibold))
            Text("SessionCtl automatically tracks all your terminal sessions. Every open tab in iTerm2 and Terminal.app appears here — no setup required.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if !sessionStore.sessions.isEmpty {
                Text("\(sessionStore.sessions.count) sessions already detected!")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.blue)
                    .padding(.top, 4)
            }

            Spacer()
            HStack {
                Spacer()
                Button("Next") { step = 1 }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private var companionStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .foregroundStyle(.orange)
                Text("Optional: Shell Companion")
                    .font(.title3.weight(.semibold))
            }

            Text("Install the shell companion for richer data — exact commands, durations, and exit statuses.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            let initCommand = "eval \"$(sessionctl init \(detectedShell))\""

            HStack {
                Text(initCommand)
                    .font(.system(.caption, design: .monospaced))
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.quaternary)
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                Button(action: {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(initCommand, forType: .string)
                }) {
                    Image(systemName: "doc.on.doc")
                }
                .buttonStyle(.bordered)
                .help("Copy to clipboard")
            }

            Text("Add to ~/.\(detectedShell)rc, then open a new terminal.")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Spacer()

            HStack {
                Button("Back") { step = 0 }
                    .buttonStyle(.plain)
                Spacer()
                Button("Skip") { step = 2 }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                Button("Done") { step = 2 }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private var doneStep: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 40))
                .foregroundStyle(.green)
            Text("You're all set!")
                .font(.title3.weight(.semibold))
            Text("SessionCtl is running in your menu bar. Use Ctrl+Shift+S to toggle the dashboard anytime.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if !sessionStore.sessions.isEmpty {
                let state = sessionStore.appState
                if state.companionCount > 0 {
                    Text("\(state.totalCount) sessions detected (\(state.companionCount) with companion)")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.blue)
                } else {
                    Text("\(state.totalCount) sessions detected")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.blue)
                }
            }

            Spacer()
            Button("Done") { onDismiss() }
                .buttonStyle(.borderedProminent)
        }
    }
}
