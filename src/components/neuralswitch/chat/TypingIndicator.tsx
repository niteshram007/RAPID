export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 animate-blink rounded-full bg-muted-foreground" />
      <span
        className="h-2 w-2 animate-blink rounded-full bg-muted-foreground"
        style={{ animationDelay: "0.2s" }}
      />
      <span
        className="h-2 w-2 animate-blink rounded-full bg-muted-foreground"
        style={{ animationDelay: "0.4s" }}
      />
    </div>
  );
}
