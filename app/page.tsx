export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="text-center px-8">
        <h1 className="text-6xl font-bold text-white mb-4">
          MockMate
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl">
          Master your PM interviews with AI-powered practice sessions
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/setup"
            className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
          >
            Start Practice Session →
          </a>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <div className="text-3xl mb-3">🎯</div>
            <h3 className="text-lg font-semibold text-white mb-2">Multiple Modes</h3>
            <p className="text-sm text-gray-400">
              Practice, Learning, Mock Interviews, and more
            </p>
          </div>

          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <div className="text-3xl mb-3">🎙️</div>
            <h3 className="text-lg font-semibold text-white mb-2">Voice Models</h3>
            <p className="text-sm text-gray-400">
              Choose from multiple professional voices
            </p>
          </div>

          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold text-white mb-2">Real-time</h3>
            <p className="text-sm text-gray-400">
              Natural conversation with barge-in support
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
