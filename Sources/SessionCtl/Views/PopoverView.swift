import SwiftUI

enum ViewMode {
    case sessions
    case newSession
    case workspaces
    case onboarding
}

struct PopoverView: View {
    @EnvironmentObject var sessionStore: SessionStore
    @EnvironmentObject var workspaceManager: WorkspaceManager
    @State private var viewMode: ViewMode = .sessions

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 8) {
                if viewMode != .sessions {
                    Button(action: { withAnimation(.easeInOut(duration: 0.15)) { viewMode = .sessions } }) {
                        Image(systemName: "chevron.left")
                            .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.plain)
                }

                Text(headerTitle)
                    .font(.headline)

                Spacer()

                if viewMode == .sessions {
                    Button(action: { withAnimation { viewMode = .workspaces } }) {
                        Image(systemName: "square.stack.3d.up")
                    }
                    .buttonStyle(.plain)
                    .help("Workspaces")

                    Button(action: { withAnimation { viewMode = .newSession } }) {
                        Image(systemName: "plus")
                    }
                    .buttonStyle(.plain)
                    .help("New Session")
                    .keyboardShortcut("n", modifiers: .command)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            // Content
            switch viewMode {
            case .sessions:
                sessionListContent
            case .newSession:
                NewSessionView(onDismiss: { withAnimation { viewMode = .sessions } })
            case .workspaces:
                WorkspacePanelView(onDismiss: { withAnimation { viewMode = .sessions } })
            case .onboarding:
                OnboardingView(onDismiss: { withAnimation { viewMode = .sessions } })
            }
        }
        .frame(width: 380, height: 520)
        .onAppear {
            checkFirstLaunch()
        }
    }

    private var headerTitle: String {
        switch viewMode {
        case .sessions: return "SessionCtl"
        case .newSession: return "New Session"
        case .workspaces: return "Workspaces"
        case .onboarding: return "Setup"
        }
    }

    @ViewBuilder
    private var sessionListContent: some View {
        SearchBar(text: $sessionStore.searchQuery)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)

        Divider()

        if sessionStore.appState.totalCount == 0 {
            EmptyStateView()
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(sessionStore.appState.groups) { group in
                        SessionGroupView(group: group)
                    }

                    if !sessionStore.appState.ungrouped.isEmpty {
                        SessionGroupView(group: SessionGroup(
                            repoRoot: nil,
                            repoName: nil,
                            sessions: sessionStore.appState.ungrouped
                        ))
                    }
                }
            }
        }

        Divider()

        // Footer
        HStack {
            Text("\(sessionStore.appState.totalCount) sessions")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Button(action: { withAnimation { viewMode = .onboarding } }) {
                Image(systemName: "gear")
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    private func checkFirstLaunch() {
        let key = "hasCompletedOnboarding"
        if !UserDefaults.standard.bool(forKey: key) {
            viewMode = .onboarding
            UserDefaults.standard.set(true, forKey: key)
        }
    }
}
