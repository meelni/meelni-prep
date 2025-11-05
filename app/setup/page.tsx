"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const EMOTIONS = [
  "Neutral", "Calm", "Confident", "Happy", "Excited", "Enthusiastic",
  "Peaceful", "Professional", "Friendly", "Curious", "Grateful",
];

const STT_MODELS = [
  { value: "deepgram/nova-2", label: "Deepgram Nova-2 (Best Balance)", languages: "33 languages" },
  { value: "deepgram/nova-3", label: "Deepgram Nova-3 (Latest)", languages: "8 languages" },
  { value: "cartesia/ink-whisper", label: "Cartesia Ink Whisper", languages: "98 languages" },
  { value: "assemblyai/universal-streaming", label: "AssemblyAI Universal", languages: "English only" },
];

const LLM_MODELS = [
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (Fast & Cheap)", category: "OpenAI" },
  { value: "openai/gpt-4o", label: "GPT-4o (Balanced)", category: "OpenAI" },
  { value: "openai/gpt-4.1", label: "GPT-4.1 (Latest)", category: "OpenAI" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Fast)", category: "Google" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Best)", category: "Google" },
  { value: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash", category: "Google" },
];

const TTS_MODELS = [
  { value: "sonic-2", label: "Sonic 2 (Balanced)" },
  { value: "sonic-3", label: "Sonic 3 (Best Quality)" },
  { value: "sonic-turbo", label: "Sonic Turbo (Fastest)" },
];

export default function InterviewSetup() {
  const router = useRouter();
  
  const [config, setConfig] = useState({
    role: "interviewee",
    mode: "mock_interview",
    interviewType: "product_sense",
    voice: "",
    skillLevel: "mid",
    speed: 1.0,
    emotion: "Neutral",
    volume: 1.0,
    ttsModel: "sonic-2",
    sttModel: "deepgram/nova-2",
    llmModel: "openai/gpt-4o-mini",
  });

  const [voices, setVoices] = useState<any[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const response = await fetch("/api/cartesia/voices");
      const data = await response.json();
      setVoices(data);
      if (data.length > 0) {
        setConfig(prev => ({ ...prev, voice: data[0].id }));
      }
    } catch (error) {
      console.error("Failed to fetch voices:", error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const filteredVoices = voices.filter(voice => {
    const matchesSearch = voice.name.toLowerCase().includes(voiceSearch.toLowerCase()) ||
                         voice.description.toLowerCase().includes(voiceSearch.toLowerCase());
    const matchesGender = selectedGender === "all" || 
                         voice.name.toLowerCase().includes(selectedGender);
    return matchesSearch && matchesGender;
  });

  const handleStartInterview = () => {
    const params = new URLSearchParams({
      role: config.role,
      mode: config.mode,
      interview_type: config.interviewType,
      voice: config.voice,
      skill_level: config.skillLevel,
      speed: config.speed.toString(),
      emotion: config.emotion,
      volume: config.volume.toString(),
      tts_model: config.ttsModel,
      stt_model: config.sttModel,
      llm_model: config.llmModel,
    });
    
    router.push("/interview?" + params.toString());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">MockMate Interview Setup</h1>
        <p className="text-gray-400 mb-8">Configure your practice session</p>

        <div className="space-y-6">
          {/* Role Selection */}
          <section className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">1. Choose Your Role</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setConfig({ ...config, role: "interviewee" })}
                className={"p-6 rounded-lg border-2 transition-all " + (
                  config.role === "interviewee"
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-gray-600 hover:border-gray-500"
                )}
              >
                <div className="text-3xl mb-2">🎤</div>
                <h3 className="text-lg font-semibold mb-2">I'm the Interviewee</h3>
                <p className="text-gray-400 text-sm">Practice being interviewed by an AI coach</p>
              </button>
              
              <button
                onClick={() => setConfig({ ...config, role: "interviewer" })}
                className={"p-6 rounded-lg border-2 transition-all " + (
                  config.role === "interviewer"
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-gray-600 hover:border-gray-500"
                )}
              >
                <div className="text-3xl mb-2">👔</div>
                <h3 className="text-lg font-semibold mb-2">I'm the Interviewer</h3>
                <p className="text-gray-400 text-sm">Practice conducting interviews with an AI candidate</p>
              </button>
            </div>
          </section>

          {/* Interview Type */}
          <section className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">2. Interview Type</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { value: "product_sense", label: "Product Sense", icon: "💡" },
                { value: "analytical_thinking", label: "Analytical", icon: "📊" },
                { value: "leadership_drive", label: "Leadership", icon: "🎯" },
                { value: "strategy", label: "Strategy", icon: "🗺️" },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setConfig({ ...config, interviewType: type.value })}
                  className={"p-4 rounded-lg border-2 transition-all " + (
                    config.interviewType === type.value
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-gray-600 hover:border-gray-500"
                  )}
                >
                  <div className="text-2xl mb-1">{type.icon}</div>
                  <div className="text-sm font-medium">{type.label}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Mode Selection */}
          {config.role === "interviewee" && (
            <section className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">3. Interview Mode</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { value: "mock_interview", label: "Mock Interview", desc: "Realistic 45-min interview" },
                  { value: "practice", label: "Practice", desc: "Quick practice with feedback" },
                  { value: "learning", label: "Learning", desc: "Learn framework components" },
                  { value: "feedback", label: "Feedback", desc: "Get detailed evaluation" },
                  { value: "demonstration", label: "Demonstration", desc: "See expert answers" },
                  { value: "interactive_coaching", label: "Interactive Coaching", desc: "Step-by-step guidance" },
                ].map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setConfig({ ...config, mode: mode.value })}
                    className={"p-4 rounded-lg border-2 transition-all text-left " + (
                      config.mode === mode.value
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-gray-600 hover:border-gray-500"
                    )}
                  >
                    <div className="font-semibold mb-1">{mode.label}</div>
                    <div className="text-xs text-gray-400">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Skill Level */}
          {config.role === "interviewer" && (
            <section className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">3. Candidate Skill Level</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { value: "junior", label: "Junior (APM)", desc: "Needs guidance, basic framework knowledge" },
                  { value: "mid", label: "Mid-Level PM", desc: "Solid grasp, occasional gaps" },
                  { value: "senior", label: "Senior PM", desc: "Strong mastery, deep insights" },
                ].map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setConfig({ ...config, skillLevel: level.value })}
                    className={"p-4 rounded-lg border-2 transition-all text-left " + (
                      config.skillLevel === level.value
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-gray-600 hover:border-gray-500"
                    )}
                  >
                    <div className="font-semibold mb-1">{level.label}</div>
                    <div className="text-xs text-gray-400">{level.desc}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Voice Selection */}
          <section className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">4. Voice Model</h2>
            
            {loadingVoices ? (
              <div className="text-center py-8 text-gray-400">Loading voices...</div>
            ) : (
              <>
                <div className="mb-4 flex gap-4">
                  <input
                    type="text"
                    placeholder="Search voices..."
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  <select
                    value={selectedGender}
                    onChange={(e) => setSelectedGender(e.target.value)}
                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Voices</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-2">
                  {filteredVoices.slice(0, 12).map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setConfig({ ...config, voice: voice.id })}
                      className={"p-4 rounded-lg border-2 transition-all text-left " + (
                        config.voice === voice.id
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-gray-600 hover:border-gray-500"
                      )}
                    >
                      <div className="font-semibold mb-1 text-sm">{voice.name}</div>
                      <div className="text-xs text-gray-400 line-clamp-2">{voice.description}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">Showing {Math.min(12, filteredVoices.length)} of {filteredVoices.length} voices</p>
              </>
            )}
          </section>

          {/* Voice Configuration */}
          <section className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">5. Voice Settings</h2>
            
            <div className="space-y-6">
              {/* Speed Control */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Speech Speed: {config.speed}x
                  <span className="text-gray-400 ml-2 text-xs">
                    ({config.speed < 0.9 ? "Slower" : config.speed > 1.1 ? "Faster" : "Normal"})
                  </span>
                </label>
                <input
                  type="range"
                  min="0.6"
                  max="1.5"
                  step="0.1"
                  value={config.speed}
                  onChange={(e) => setConfig({ ...config, speed: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0.6x (Slowest)</span>
                  <span>1.0x (Normal)</span>
                  <span>1.5x (Fastest)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Emotion Control */}
                <div>
                  <label className="block text-sm font-medium mb-2">Emotion</label>
                  <select
                    value={config.emotion}
                    onChange={(e) => setConfig({ ...config, emotion: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {EMOTIONS.map((emotion) => (
                      <option key={emotion} value={emotion}>{emotion}</option>
                    ))}
                  </select>
                </div>

                {/* TTS Model */}
                <div>
                  <label className="block text-sm font-medium mb-2">TTS Model</label>
                  <select
                    value={config.ttsModel}
                    onChange={(e) => setConfig({ ...config, ttsModel: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {TTS_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Volume Control */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Volume: {config.volume}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={config.volume}
                  onChange={(e) => setConfig({ ...config, volume: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>2.0x</span>
                </div>
              </div>
            </div>
          </section>

          {/* Advanced Settings */}
          <section className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-xl font-semibold mb-4"
            >
              <span>6. Advanced Settings (Optional)</span>
              <span className="text-2xl">{showAdvanced ? "▼" : "▶"}</span>
            </button>
            
            {showAdvanced && (
              <div className="space-y-4">
                {/* STT Model */}
                <div>
                  <label className="block text-sm font-medium mb-2">Speech-to-Text Model</label>
                  <select
                    value={config.sttModel}
                    onChange={(e) => setConfig({ ...config, sttModel: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {STT_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label} - {model.languages}
                      </option>
                    ))}
                  </select>
                </div>

                {/* LLM Model */}
                <div>
                  <label className="block text-sm font-medium mb-2">Language Model (LLM)</label>
                  <select
                    value={config.llmModel}
                    onChange={(e) => setConfig({ ...config, llmModel: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {LLM_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label} ({model.category})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    GPT-4o-mini is recommended for cost-effectiveness
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Summary and Start */}
          <section className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-lg p-6 border border-blue-500/50">
            <h3 className="text-xl font-semibold mb-3">Session Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              <div>
                <span className="text-gray-400">Role:</span>
                <span className="ml-2 font-medium">
                  {config.role === "interviewee" ? "Interviewee" : "Interviewer"}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Type:</span>
                <span className="ml-2 font-medium">
                  {config.interviewType.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </div>
              {config.role === "interviewee" && (
                <div>
                  <span className="text-gray-400">Mode:</span>
                  <span className="ml-2 font-medium">
                    {config.mode.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-400">Speed:</span>
                <span className="ml-2 font-medium">{config.speed}x</span>
              </div>
              <div>
                <span className="text-gray-400">LLM:</span>
                <span className="ml-2 font-medium text-xs">{config.llmModel}</span>
              </div>
              <div>
                <span className="text-gray-400">STT:</span>
                <span className="ml-2 font-medium text-xs">{config.sttModel}</span>
              </div>
            </div>
            
            <button
              onClick={handleStartInterview}
              disabled={!config.voice || loadingVoices}
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-lg font-semibold text-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingVoices ? "Loading..." : "Start Interview Session →"}
            </button>
          </section>
        </div>

        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Interruption/barge-in is automatically enabled via voice activity detection</p>
        </div>
      </div>
    </div>
  );
}
