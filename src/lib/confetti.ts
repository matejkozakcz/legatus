import confetti from "canvas-confetti";

export function fireConfetti() {
  const duration = 800;
  const end = Date.now() + duration;

  const frame = () => {
    // Left corner
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 1 },
      colors: ["#fc7c71", "#00abbd", "#00555f", "#FFD700", "#ffffff"],
    });
    // Right corner
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 1 },
      colors: ["#fc7c71", "#00abbd", "#00555f", "#FFD700", "#ffffff"],
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };

  frame();
}
