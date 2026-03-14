import SwiftUI

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "terminal")
                .font(.system(size: 36))
                .foregroundStyle(.secondary)
            Text("No Terminal Sessions")
                .font(.subheadline.weight(.medium))
            Text("Open Terminal.app or iTerm2 to get started. Sessions appear here automatically.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
