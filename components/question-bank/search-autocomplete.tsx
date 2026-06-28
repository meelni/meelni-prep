"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Building2, FileText } from "lucide-react";

interface Question {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
}

interface SearchAutocompleteProps {
  questions: Question[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (questionId?: string) => void;
}

export function SearchAutocomplete({
  questions,
  value,
  onChange,
  onSelect,
}: SearchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Generate autocomplete suggestions
  const suggestions = useMemo(() => {
    if (value.length < 2) return { companies: [], questions: [] };

    const query = value.toLowerCase();
    const companySet = new Set<string>();
    const questionMatches: Question[] = [];

    questions.forEach((q) => {
      if (q.company && q.company.toLowerCase().includes(query)) {
        companySet.add(q.company);
      }
      if (q.questionText.toLowerCase().includes(query)) {
        questionMatches.push(q);
      }
    });

    const companies = Array.from(companySet)
      .slice(0, 4)
      .map((company) => ({
        type: "company" as const,
        value: company,
        count: questions.filter((q) => q.company === company).length,
      }));

    const questionSuggestions = questionMatches.slice(0, 4).map((q) => ({
      type: "question" as const,
      value: q.questionText,
      id: q.id,
    }));

    return {
      companies,
      questions: questionSuggestions,
    };
  }, [questions, value]);

  const allSuggestions = [...suggestions.companies, ...suggestions.questions];

  // Show dropdown when there are suggestions
  useEffect(() => {
    setIsOpen(value.length >= 2 && allSuggestions.length > 0);
    setHighlightedIndex(0);
  }, [value, allSuggestions.length]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < allSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (allSuggestions[highlightedIndex]) {
          handleSelect(allSuggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelect = (
    suggestion:
      | { type: "company"; value: string; count: number }
      | { type: "question"; value: string; id: string }
  ) => {
    if (suggestion.type === "company") {
      onChange(suggestion.value);
      onSelect();
    } else {
      onSelect(suggestion.id);
    }
    setIsOpen(false);
  };

  // Highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query) return <span>{text}</span>;

    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-primary/20 text-foreground font-medium">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative z-50 flex-1">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search questions by text or company..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="bg-card w-full rounded-lg py-2.5 pr-4 pl-10 transition-all duration-150"
        aria-label="Search questions"
        aria-autocomplete="list"
        aria-controls="search-suggestions"
        aria-expanded={isOpen}
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="search-suggestions"
            ref={dropdownRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="bg-card border-border divide-border absolute top-full z-50 mt-2 max-h-80 w-full divide-y overflow-y-auto rounded-lg border shadow-lg backdrop-blur-xl"
            role="listbox"
          >
            {/* Company results */}
            {suggestions.companies.length > 0 && (
              <div>
                <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                  <Building2 className="h-3 w-3" />
                  Companies ({suggestions.companies.length})
                </div>
                {suggestions.companies.map((company, index) => (
                  <Button
                    key={company.value}
                    type="button"
                    variant="ghost"
                    onClick={() => handleSelect(company)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex min-h-[48px] w-full items-center justify-between px-3 py-3 text-left transition-colors md:min-h-0 md:py-2.5 ${
                      highlightedIndex === index
                        ? "bg-primary/5"
                        : "hover:bg-primary/5"
                    }`}
                    role="option"
                    aria-selected={highlightedIndex === index}
                  >
                    <span className="text-foreground text-sm font-medium">
                      {highlightMatch(company.value, value)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {company.count} questions
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {/* Question text results */}
            {suggestions.questions.length > 0 && (
              <div>
                <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                  <FileText className="h-3 w-3" />
                  Questions ({suggestions.questions.length})
                </div>
                {suggestions.questions.map((question, index) => {
                  const actualIndex = suggestions.companies.length + index;
                  return (
                    <Button
                      key={question.id}
                      type="button"
                      variant="ghost"
                      onClick={() => handleSelect(question)}
                      onMouseEnter={() => setHighlightedIndex(actualIndex)}
                      className={`min-h-[48px] w-full px-3 py-3 text-left transition-colors md:min-h-0 md:py-2.5 ${
                        highlightedIndex === actualIndex
                          ? "bg-primary/5"
                          : "hover:bg-primary/5"
                      }`}
                      role="option"
                      aria-selected={highlightedIndex === actualIndex}
                    >
                      <p className="text-foreground line-clamp-2 text-sm">
                        {highlightMatch(question.value, value)}
                      </p>
                    </Button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
