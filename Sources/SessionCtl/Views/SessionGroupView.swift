import SwiftUI

struct SessionGroupView: View {
    let group: SessionGroup
    @State private var isExpanded = true

    var body: some View {
        VStack(spacing: 0) {
            // Group header
            Button(action: { withAnimation(.easeInOut(duration: 0.15)) { isExpanded.toggle() } }) {
                HStack(spacing: 6) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 10)

                    Image(systemName: "folder.fill")
                        .foregroundStyle(.blue)
                        .font(.caption)

                    Text(group.repoName ?? "No Repository")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)

                    Spacer()

                    Text("\(group.sessions.count)")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.quaternary)
                        .clipShape(Capsule())
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                ForEach(Array(group.sessions.enumerated()), id: \.element.id) { index, session in
                    SessionRowView(session: session, index: index + 1)
                }
            }
        }
    }
}
