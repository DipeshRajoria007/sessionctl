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
            case 1: shellSetupStep
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
            Text("Mission control for your AI terminal sessions. See all your sessions at a glance, grouped by repository.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
            Button("Get Started") { step = 1 }
                .buttonStyle(.borderedProminent)
        }
    }

    private var shellSetupStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Install Shell Companion")
                .font(.title3.weight(.semibold))

            Text("Add this line to your ~/.\(detectedShell)rc:")
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

            Text("Then open a new terminal window to activate.")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Spacer()

            HStack {
                Button("Back") { step = 0 }
                    .buttonStyle(.plain)
                Spacer()
                Button("Next") { step = 2 }
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
                Text("\(sessionStore.sessions.count) sessions already detected!")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.blue)
            }

            Spacer()
            Button("Done") { onDismiss() }
                .buttonStyle(.borderedProminent)
        }
    }
}
