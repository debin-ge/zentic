process.on("message", (message) => {
  if (message?.type !== "zentic_frame") return;
  process.send?.(message);
});
