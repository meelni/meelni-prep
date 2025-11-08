"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

  const allSuggestions = [
    ...suggestions.companies,
    ...suggestions.questions,
  ];

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
            <mark
              key={i}
              className="bg-primary/20 text-foreground font-medium"
            >
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
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search questions or companies..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
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
            className="absolute top-full mt-2 w-full bg-popover border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto divide-y divide-border z-50"
            role="listbox"
          >
            {/* Company results */}
            {suggestions.companies.length > 0 && (
              <div>
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Building2 className="w-3 h-3" />
                  Companies ({suggestions.companies.length})
                </div>
                {suggestions.companies.map((company, index) => (
                  <button
                    key={company.value}
                    onClick={() => handleSelect(company)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full px-3 py-3 md:py-2.5 min-h-[48px] md:min-h-0 text-left transition-colors flex items-center justify-between ${
                      highlightedIndex === index
                        ? "bg-primary/5"
                        : "hover:bg-primary/5"
                    }`}
                    role="option"
                    aria-selected={highlightedIndex === index}
                  >
                    <span className="text-sm text-foreground font-medium">
                      {highlightMatch(company.value, value)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {company.count} questions
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Question text results */}
            {suggestions.questions.length > 0 && (
              <div>
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <FileText className="w-3 h-3" />
                  Questions ({suggestions.questions.length})
                </div>
                {suggestions.questions.map((question, index) => {
                  const actualIndex = suggestions.companies.length + index;
                  return (
                    <button
                      key={question.id}
                      onClick={() => handleSelect(question)}
                      onMouseEnter={() => setHighlightedIndex(actualIndex)}
                      className={`w-full px-3 py-3 md:py-2.5 min-h-[48px] md:min-h-0 text-left transition-colors ${
                        highlightedIndex === actualIndex
                          ? "bg-primary/5"
                          : "hover:bg-primary/5"
                      }`}
                      role="option"
                      aria-selected={highlightedIndex === actualIndex}
                    >
                      <p className="text-sm text-foreground line-clamp-2">
                        {highlightMatch(question.value, value)}
                      </p>
                    </button>
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
