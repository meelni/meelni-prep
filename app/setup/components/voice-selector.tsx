"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface Voice {
  id: string;
  name: string;
  description: string;
  gender?: string;
  language?: string;
}

interface VoiceSelectorProps {
  selected: string;
  onSelect: (voiceId: string) => void;
}

// Curated list of recommended voices
const RECOMMENDED_VOICES: Voice[] = [
  {
    id: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    name: "Tessa",
    description: "Emotive voice optimized for natural conversation",
    gender: "Female",
  },
  {
    id: "f9e3eb4c-ab3f-4db1-9c48-c7b806b080b1",
    name: "British Male",
    description: "Professional British accent, clear and authoritative",
    gender: "Male",
  },
  {
    id: "63ff761f-c1e8-414b-b969-d1833d1c870c",
    name: "Conversational Male",
    description: "Friendly and approachable conversational style",
    gender: "Male",
  },
  {
    id: "821fb995-1ba6-4dc9-ab71-7df7c1fe4710",
    name: "Professional Female",
    description: "Confident and polished professional tone",
    gender: "Female",
  },
];

export function VoiceSelector({ selected, onSelect }: VoiceSelectorProps) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>(RECOMMENDED_VOICES);
  const [loading, setLoading] = useState(false);

  // Note: Audio preview would require Cartesia API integration
  // For MVP, we'll show the voice options without preview
  const handlePlayPreview = (voiceId: string) => {
    // TODO: Implement audio preview using Cartesia API
    // For now, just toggle the playing state
    if (playing === voiceId) {
      setPlaying(null);
    } else {
      setPlaying(voiceId);
      // Auto-stop after 3 seconds (simulated preview)
      setTimeout(() => setPlaying(null), 3000);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Voice Selection</h3>
        <p className="text-sm text-muted-foreground">
          Choose an AI interviewer voice that makes you comfortable
        </p>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid gap-3 md:grid-cols-2"
      >
        {voices.map((voice) => {
          const isSelected = selected === voice.id;
          const isPlaying = playing === voice.id;

          return (
            <motion.div key={voice.id} variants={fadeInUp}>
              <Card
                className={`
                  relative cursor-pointer transition-all duration-200 p-5
                  hover:scale-[1.01]
                  ${
                    isSelected
                      ? "border-primary shadow-md ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50"
                  }
                `}
                onClick={() => onSelect(voice.id)}
              >
                <div className="space-y-3">
                  {/* Header with name and badge */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{voice.name}</h4>
                        {voice.gender && (
                          <Badge variant="outline" className="text-xs">
                            {voice.gender}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {voice.description}
                      </p>
                    </div>

                    {/* Selection indicator */}
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
                      >
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </motion.div>
                    )}
                  </div>

                  {/* Preview button */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPreview(voice.id);
                      }}
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-3 h-3 mr-1.5" />
                          <span className="text-xs">Playing...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 mr-1.5" />
                          <span className="text-xs">Preview</span>
                        </>
                      )}
                    </Button>
                    {isPlaying && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-1"
                      >
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-1 h-3 bg-primary rounded-full"
                            animate={{
                              scaleY: [1, 1.5, 1],
                            }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: i * 0.15,
                            }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
        <Volume2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Voice preview coming soon. All voices are optimized for natural,
          professional conversation using Cartesia Sonic 3.
        </p>
      </div>
    </div>
  );
}
