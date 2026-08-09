"use client";

import { Icons } from "@/components/icons";
import { Section } from "@/components/section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Ripple } from "@/components/ui/ripple";

const contributors = [
  {
    name: "Alice Johnson",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8cG9ydHJhaXR8ZW58MHx8MHx8fDA%3D",
  },
  {
    name: "Bob Brown",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTh8fHBvcnRyYWl0fGVufDB8fDB8fHww",
  },
  {
    name: "Charlie Davis",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fHBvcnRyYWl0fGVufDB8fDB8fHww",
  },
  {
    name: "Diana Evans",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mjh8fHBvcnRyYWl0fGVufDB8fDB8fHww",
  },
  {
    name: "Ethan Ford",
    avatar:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MzJ8fHBvcnRyYWl0fGVufDB8fDB8fHww",
  },
];

export function Community() {
  return (
    <Section id="community" title="Community">
      <div className="relative overflow-hidden border-x border-t">
        <Ripple />
        <div className="p-6 py-12 text-center">
          <p className="text-muted-foreground mx-auto mb-6 max-w-prose font-medium text-balance">
            We&apos;re grateful for the amazing open-source community that helps
            make our project better every day.
          </p>
          <div className="mb-8 flex justify-center -space-x-6">
            {contributors.map((contributor, index) => (
              <div key={index}>
                <Avatar className="border-background bg-muted relative size-12 border-2">
                  <AvatarImage
                    src={contributor.avatar}
                    alt={contributor.name}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-lg font-semibold">
                    {contributor.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Button variant="secondary" className="flex items-center gap-2">
              <Icons.github className="h-5 w-5" />
              Become a contributor
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
