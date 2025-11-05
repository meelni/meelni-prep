"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Interview type configurations
const INTERVIEW_TYPES = [
  {
    value: "product_sense",
    label: "Product Sense",
    icon: "💡",
    description: "Design a new feature or improve an existing product",
    duration: "~45 min",
  },
  {
    value: "analytical_thinking",
    label: "Analytical Thinking",
    icon: "📊",
    description: "Define metrics and analyze product performance",
    duration: "~45 min",
  },
  {
    value: "leadership_drive",
    label: "Leadership & Drive",
    icon: "🎯",
    description: "Behavioral questions using STAR method",
    duration: "~30 min",
  },
  {
    value: "strategy",
    label: "Strategy",
    icon: "🗺️",
    description: "Complex business and strategic discussions",
    duration: "~45 min",
  },
];

// Interview modes
const INTERVIEW_MODES = [
  { value: "mock_interview", label: "Mock Interview", icon: "🎬" },
  { value: "practice", label: "Practice", icon: "🏃" },
  { value: "learning", label: "Learning", icon: "📚" },
];

// Advanced settings constants
const EMOTIONS = [
  "Neutral", "Calm", "Confident", "Happy", "Excited", "Enthusiastic",
  "Peaceful", "Professional", "Friendly", "Curious", "Grateful",
];

const STT_MODELS = [
  { value: "deepgram/nova-2", label: "Deepgram Nova-2 (Recommended)" },
  { value: "deepgram/nova-3", label: "Deepgram Nova-3 (Latest)" },
  { value: "cartesia/ink-whisper", label: "Cartesia Ink Whisper" },
];

const LLM_MODELS = [
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (Recommended)" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

const TTS_MODELS = [
  { value: "sonic-3", label: "Sonic 3 (Best Quality)" },
  { value: "sonic-2", label: "Sonic 2 (Balanced)" },
  { value: "sonic-turbo", label: "Sonic Turbo (Fastest)" },
];

export default function InterviewSetup() {
  const router = useRouter();

  // Core configuration
  const [selectedType, setSelectedType] = useState("product_sense");
  const [selectedMode, setSelectedMode] = useState("mock_interview");
  const [selectedVoice, setSelectedVoice] = useState("");

  // Advanced settings (hidden by default)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [emotion, setEmotion] = useState("Confident");
  const [volume, setVolume] = useState(1.0);
  const [ttsModel, setTtsModel] = useState("sonic-3");
  const [sttModel, setSttModel] = useState("deepgram/nova-2");
  const [llmModel, setLlmModel] = useState("openai/gpt-4o-mini");

  // Voice loading
  const [voices, setVoices] = useState<any[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const response = await fetch("/api/cartesia/voices");
      const data = await response.json();
      setVoices(data);
      if (data.length > 0) {
        setSelectedVoice(data[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch voices:", error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleStartInterview = () => {
    const params = new URLSearchParams({
      role: "interviewee",
      mode: selectedMode,
      interview_type: selectedType,
      voice: selectedVoice,
      skill_level: "mid",
      speed: speed.toString(),
      emotion: emotion,
      volume: volume.toString(),
      tts_model: ttsModel,
      stt_model: sttModel,
      llm_model: llmModel,
    });

    router.push("/interview?" + params.toString());
  };

  const selectedTypeData = INTERVIEW_TYPES.find(t => t.value === selectedType);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-12 text-center">
          <a href="/" className="inline-block mb-6 text-gray-400 hover:text-white transition-colors">
            ← Back to Home
          </a>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Start Your Practice
          </h1>
          <p className="text-gray-400 text-lg">
            Choose your interview type and voice to begin
          </p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 text-sm">1</span>
              What do you want to practice?
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {INTERVIEW_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={"group relative p-6 rounded-xl border-2 transition-all text-left " + (
                    selectedType === type.value
                      ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20"
                      : "border-gray-700 hover:border-gray-600 bg-gray-800/30"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{type.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                        {type.label}
                      </h3>
                      <p className="text-sm text-gray-400 mb-3">{type.description}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {type.duration}
                      </div>
                    </div>
                  </div>
                  {selectedType === type.value && (
                    <div className="absolute top-4 right-4">
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 text-sm">2</span>
              Choose your practice mode
            </h2>

            <div className="flex gap-3">
              {INTERVIEW_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setSelectedMode(mode.value)}
                  className={"flex-1 p-4 rounded-xl border-2 transition-all " + (
                    selectedMode === mode.value
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-gray-700 hover:border-gray-600 bg-gray-800/30"
                  )}
                >
                  <div className="text-2xl mb-2">{mode.icon}</div>
                  <div className="font-medium">{mode.label}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 text-sm">3</span>
              Select your interviewer's voice
            </h2>

            {loadingVoices ? (
              <div className="text-center py-12 text-gray-400">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                <p>Loading voices...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {voices.slice(0, 8).map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={"p-4 rounded-xl border-2 transition-all text-left " + (
                      selectedVoice === voice.id
                        ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20"
                        : "border-gray-700 hover:border-gray-600 bg-gray-800/30"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xl">
                        🎤
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{voice.name}</div>
                        <div className="text-xs text-gray-500 capitalize">{voice.gender}</div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{voice.description}</p>
                    {selectedVoice === voice.id && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-blue-400">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Selected
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {voices.length > 8 && (
              <p className="text-sm text-gray-500 mt-3 text-center">
                Showing 8 of {voices.length} voices • More options in advanced settings
              </p>
            )}
          </section>

          <section className="border-t border-gray-800 pt-8">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors mb-6"
            >
              <svg
                className={"w-5 h-5 transition-transform " + (showAdvanced ? 'rotate-90' : '')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-medium">Advanced Settings</span>
              <span className="text-xs text-gray-600">(optional)</span>
            </button>

            {showAdvanced && (
              <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-3">
                      Speech Speed: <span className="text-blue-400">{speed}x</span>
                    </label>
                    <input
                      type="range"
                      min="0.6"
                      max="1.5"
                      step="0.1"
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                      <span>Slower</span>
                      <span>Normal</span>
                      <span>Faster</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-3">
                      Volume: <span className="text-blue-400">{volume}x</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                      <span>Quiet</span>
                      <span>Normal</span>
                      <span>Loud</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Voice Emotion</label>
                    <select
                      value={emotion}
                      onChange={(e) => setEmotion(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      {EMOTIONS.map((em) => (
                        <option key={em} value={em}>{em}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">TTS Model</label>
                    <select
                      value={ttsModel}
                      onChange={(e) => setTtsModel(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      {TTS_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Speech Recognition</label>
                    <select
                      value={sttModel}
                      onChange={(e) => setSttModel(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      {STT_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">AI Model</label>
                    <select
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      {LLM_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="sticky bottom-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 -mx-6 px-6 py-6 border-t border-gray-700">
            <div className="max-w-5xl mx-auto">
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Ready to start?</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="text-blue-400">{selectedTypeData?.icon}</span>
                        {selectedTypeData?.label}
                      </span>
                      <span>•</span>
                      <span>{INTERVIEW_MODES.find(m => m.value === selectedMode)?.label}</span>
                      <span>•</span>
                      <span>{speed}x speed</span>
                    </div>
                  </div>
                  <button
                    onClick={handleStartInterview}
                    disabled={!selectedVoice || loadingVoices}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                  >
                    Start Interview
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
