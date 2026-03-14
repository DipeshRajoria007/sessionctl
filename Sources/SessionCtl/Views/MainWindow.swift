import SwiftUI

struct MainWindow: View {
    @EnvironmentObject var sessionStore: SessionStore
    @EnvironmentObject var splitManager: SplitManager

    var body: some View {
        NavigationSplitView {
            SidebarView()
        } detail: {
            if let root = splitManager.root {
                SplitContainerView(node: root)
            } else {
                WelcomeView()
            }
        }
    }
}
