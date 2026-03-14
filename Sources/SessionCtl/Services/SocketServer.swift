import Foundation

class SocketServer {
    private let socketPath: String
    private var serverFD: Int32 = -1
    private var isRunning = false
    private var acceptSource: DispatchSourceRead?
    private var clientSources: [DispatchSourceRead] = []
    private let eventHandler: @Sendable (SessionEvent) -> Void

    init(socketPath: String? = nil, eventHandler: @escaping @Sendable (SessionEvent) -> Void) {
        self.socketPath = socketPath ?? (NSHomeDirectory() + "/.sessionctl/sock")
        self.eventHandler = eventHandler
    }

    func start() throws {
        let dir = (socketPath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(
            atPath: dir,
            withIntermediateDirectories: true
        )

        // Remove stale socket
        if FileManager.default.fileExists(atPath: socketPath) {
            try FileManager.default.removeItem(atPath: socketPath)
        }

        // Create Unix domain socket
        serverFD = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverFD >= 0 else {
            throw SocketError.createFailed
        }

        // Bind to path
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)

        let maxLen = MemoryLayout.size(ofValue: addr.sun_path)
        guard socketPath.utf8.count < maxLen else {
            Darwin.close(serverFD)
            throw SocketError.pathTooLong
        }

        withUnsafeMutablePointer(to: &addr.sun_path.0) { ptr in
            socketPath.withCString { src in
                _ = memcpy(ptr, src, socketPath.utf8.count + 1)
            }
        }

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                bind(serverFD, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult == 0 else {
            Darwin.close(serverFD)
            throw SocketError.bindFailed(errno)
        }

        chmod(socketPath, 0o600)

        guard listen(serverFD, 5) == 0 else {
            Darwin.close(serverFD)
            throw SocketError.listenFailed
        }

        isRunning = true

        let source = DispatchSource.makeReadSource(fileDescriptor: serverFD, queue: .global())
        source.setEventHandler { [weak self] in
            self?.acceptClient()
        }
        source.setCancelHandler { [weak self] in
            if let fd = self?.serverFD, fd >= 0 {
                Darwin.close(fd)
            }
        }
        source.resume()
        acceptSource = source
    }

    func stop() {
        isRunning = false
        acceptSource?.cancel()
        acceptSource = nil
        for source in clientSources {
            source.cancel()
        }
        clientSources.removeAll()
        if serverFD >= 0 {
            Darwin.close(serverFD)
            serverFD = -1
        }
        try? FileManager.default.removeItem(atPath: socketPath)
    }

    private func acceptClient() {
        let clientFD = accept(serverFD, nil, nil)
        guard clientFD >= 0 else { return }

        let flags = fcntl(clientFD, F_GETFL)
        _ = fcntl(clientFD, F_SETFL, flags | O_NONBLOCK)

        var buffer = Data()
        let handler = eventHandler

        let source = DispatchSource.makeReadSource(fileDescriptor: clientFD, queue: .global())
        source.setEventHandler {
            var readBuffer = [UInt8](repeating: 0, count: 4096)
            let bytesRead = read(clientFD, &readBuffer, readBuffer.count)

            if bytesRead <= 0 {
                source.cancel()
                Darwin.close(clientFD)
                return
            }

            buffer.append(contentsOf: readBuffer[0..<bytesRead])

            // Process newline-delimited JSON
            while let newlineIndex = buffer.firstIndex(of: UInt8(ascii: "\n")) {
                let lineData = buffer[buffer.startIndex..<newlineIndex]
                buffer = Data(buffer[buffer.index(after: newlineIndex)...])

                guard lineData.count <= 65536 else { continue }

                let decoder = JSONDecoder()
                if let event = try? decoder.decode(SessionEvent.self, from: Data(lineData)) {
                    handler(event)
                }
            }
        }
        source.setCancelHandler {
            Darwin.close(clientFD)
        }
        source.resume()
        clientSources.append(source)
    }

    enum SocketError: Error, LocalizedError {
        case createFailed
        case pathTooLong
        case bindFailed(Int32)
        case listenFailed

        var errorDescription: String? {
            switch self {
            case .createFailed: return "Failed to create Unix socket"
            case .pathTooLong: return "Socket path exceeds maximum length"
            case .bindFailed(let errno): return "Failed to bind socket: errno \(errno)"
            case .listenFailed: return "Failed to listen on socket"
            }
        }
    }
}
