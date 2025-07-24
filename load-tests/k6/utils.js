export function parseDurationAsMs(duration) {
  // duration in the form "number" + "s" | "m" | "h", so split on the last char
  const value = duration.slice(0, -1);
  const unit = duration.slice(-1);
  const valueNum = parseInt(value);
  switch (unit) {
    case "s":
      return valueNum * 1000;
    case "m":
      return valueNum * 60 * 1000;
    case "h":
      return valueNum * 60 * 60 * 1000;
  }
}
