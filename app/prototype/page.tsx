import type { Metadata } from "next";
import { PrototypeChat } from "@/components/prototype/PrototypeChat";

export const metadata: Metadata = {
  title: "Deterministic Chat Prototype",
  description: "A fictional local interface for exercising deterministic intake behavior.",
  robots: { index: false, follow: false },
};

export default function PrototypePage() {
  return <PrototypeChat />;
}
