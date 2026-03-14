import SwiftUI

struct SidebarView: View {
    @EnvironmentObject var sessionStore: SessionStore
    @EnvironmentObject var splitManager: SplitManager

    var body: some View {
        VStack(spacing: 0) {
            SearchBar(text: $sessionStore.searchQuery)
                .padding(8)

            List(selection: $splitManager.selectedPaneSessionID) {
                let state = sessionStore.appState

                // Grouped sessions (by repo)
                ForEach(state.groups) { group in
                    Section(header: Text(group.repoName ?? "Unknown").font(.caption).foregroundStyle(.secondary)) {
                        ForEach(group.sessions) { session in
                            SidebarSessionRow(session: session)
                                .tag(session.id)
                        }
                    }
                }

                // Ungrouped sessions
                if !state.ungrouped.isEmpty {
                    Section(header: Text("Other").font(.caption).foregroundStyle(.secondary)) {
                        ForEach(state.ungrouped) { session in
                            SidebarSessionRow(session: session)
                                .tag(session.id)
                        }
                    }
                }
            }
            .listStyle(.sidebar)

            Divider()

            // New terminal button
            Button(action: {
                if let appDelegate = NSApp.delegate as? AppDelegate {
                    appDelegate.newTerminal()
                }
            }) {
                HStack {
                    Image(systemName: "plus")
                    Text("New Terminal")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .frame(minWidth: 180)
    }
}
