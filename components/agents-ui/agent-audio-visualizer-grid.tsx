"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  memo,
  useMemo,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  useMultibandTrackVolume,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { cva, type VariantProps } from "class-variance-authority";
import { useReducedMotion } from "framer-motion";
import type { LocalAudioTrack, RemoteAudioTrack } from "livekit-client";

import {
  useAgentAudioVisualizerGridAnimator,
  type Coordinate,
  type VoiceVisualizerState,
} from "@/hooks/agents-ui/use-agent-audio-visualizer-grid";
import { cn } from "@/lib/utils";

export type { VoiceVisualizerState } from "@/hooks/agents-ui/use-agent-audio-visualizer-grid";

const cellVariants = cva(
  "place-self-center rounded-full bg-current/10 transition-[background-color,opacity,transform] duration-150 ease-out motion-reduce:transition-none data-[lk-highlighted=true]:scale-110 data-[lk-highlighted=true]:bg-current",
  {
    variants: {
      size: {
        icon: "h-0.5 w-0.5",
        sm: "h-1 w-1",
        md: "h-2 w-2",
        lg: "h-3 w-3",
        xl: "h-4 w-4",
      },
    },
    defaultVariants: { size: "md" },
  }
);

const gridVariants = cva("grid", {
  variants: {
    size: {
      icon: "gap-0.5",
      sm: "gap-1",
      md: "gap-2",
      lg: "gap-3",
      xl: "gap-4",
    },
  },
  defaultVariants: { size: "md" },
});

export interface AgentAudioVisualizerGridProps
  extends Omit<ComponentProps<"div">, "children">,
    VariantProps<typeof gridVariants> {
  state?: VoiceVisualizerState;
  radius?: number;
  interval?: number;
  rowCount?: number;
  columnCount?: number;
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;
  volumeBands?: number[];
  cellLevels?: number[];
  children?: ReactNode;
}

function cloneSingleChild(
  children: ReactNode,
  props: Record<string, unknown>,
  key: number
) {
  if (!isValidElement(children) || Children.count(children) !== 1) {
    return children;
  }

  const childProps = children.props as {
    className?: string;
    style?: CSSProperties;
  };
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    ...props,
    className: cn(childProps.className, props.className as string),
    style: { ...childProps.style, ...(props.style as CSSProperties) },
    key,
  });
}

interface GridCellProps {
  index: number;
  state: VoiceVisualizerState;
  interval: number;
  rowCount: number;
  columnCount: number;
  volumeBands: number[];
  cellLevels?: number[];
  highlightedCoordinate: Coordinate;
  children: ReactNode;
}

const CELL_LEVEL_OPACITY = [0.1, 0.22, 0.45, 0.72, 1] as const;
const CELL_LEVEL_SCALE = [0.78, 0.84, 0.92, 1, 1.1] as const;

const GridCell = memo(function GridCell({
  index,
  state,
  interval,
  rowCount,
  columnCount,
  volumeBands,
  cellLevels,
  highlightedCoordinate,
  children,
}: GridCellProps) {
  if (cellLevels) {
    const level = Math.max(0, Math.min(4, Math.round(cellLevels[index] ?? 0)));

    return cloneSingleChild(
      children,
      {
        "data-lk-index": index,
        "data-lk-level": level,
        style: {
          backgroundColor: "currentColor",
          opacity: CELL_LEVEL_OPACITY[level],
          transform: `scale(${CELL_LEVEL_SCALE[level]})`,
          transitionDuration: "80ms",
        },
      },
      index
    );
  }

  if (state === "speaking") {
    const y = Math.floor(index / columnCount);
    const rowMidPoint = Math.floor(rowCount / 2);
    const volumeChunks = 1 / (rowMidPoint + 1);
    const distanceToMid = Math.abs(rowMidPoint - y);
    const threshold = distanceToMid * volumeChunks;
    const isHighlighted = (volumeBands[index % columnCount] ?? 0) >= threshold;

    return cloneSingleChild(
      children,
      {
        "data-lk-index": index,
        "data-lk-highlighted": isHighlighted,
      },
      index
    );
  }

  const isHighlighted =
    highlightedCoordinate.x === index % columnCount &&
    highlightedCoordinate.y === Math.floor(index / columnCount);

  return cloneSingleChild(
    children,
    {
      "data-lk-index": index,
      "data-lk-highlighted": isHighlighted,
      style: {
        transitionDuration: `${interval / (isHighlighted ? 1000 : 100)}s`,
      },
    },
    index
  );
});

export function AgentAudioVisualizerGrid({
  size = "md",
  state = "connecting",
  radius,
  interval = 100,
  rowCount = 5,
  columnCount = 5,
  className,
  children,
  audioTrack,
  volumeBands,
  cellLevels,
  style,
  ...props
}: AgentAudioVisualizerGridProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const items = useMemo(
    () => Array.from({ length: columnCount * rowCount }, (_, index) => index),
    [columnCount, rowCount]
  );
  const highlightedCoordinate = useAgentAudioVisualizerGridAnimator(
    state,
    rowCount,
    columnCount,
    interval,
    radius,
    shouldReduceMotion
  );
  const trackVolumeBands = useMultibandTrackVolume(audioTrack, {
    bands: columnCount,
    loPass: 100,
    hiPass: 200,
  });
  const resolvedVolumeBands = useMemo(
    () =>
      Array.from(
        { length: columnCount },
        (_, index) =>
          volumeBands?.[index] ??
          (shouldReduceMotion && state === "speaking"
            ? 1 -
              Math.abs(Math.floor(columnCount / 2) - index) /
                (Math.floor(columnCount / 2) + 1)
            : (trackVolumeBands[index] ?? 0))
      ),
    [columnCount, shouldReduceMotion, state, trackVolumeBands, volumeBands]
  );
  const cell = children ?? <span className={cellVariants({ size })} />;

  if (children && Children.count(children) !== 1) {
    throw new Error(
      "AgentAudioVisualizerGrid children must be a single element."
    );
  }

  return (
    <div
      data-lk-state={state}
      className={cn(gridVariants({ size }), className)}
      style={{
        ...style,
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      }}
      {...props}
    >
      {items.map((index) => (
        <GridCell
          key={index}
          index={index}
          state={state}
          interval={interval}
          rowCount={rowCount}
          columnCount={columnCount}
          volumeBands={resolvedVolumeBands}
          cellLevels={cellLevels}
          highlightedCoordinate={highlightedCoordinate}
        >
          {cell}
        </GridCell>
      ))}
    </div>
  );
}
