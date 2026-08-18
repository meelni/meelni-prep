interface ImportMeta {
  glob<T = unknown>(
    pattern: string,
    options: {
      eager: true;
      import: string;
      query: string;
    }
  ): Record<string, T>;
}
