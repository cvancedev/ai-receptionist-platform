import type { Metadata } from "next";
import { PrototypeChat } from "@/components/prototype/PrototypeChat";

export const metadata: Metadata = {
  title: "Internal Fictional MVP Experience",
  description: "A local fictional interface for inspecting the deterministic receptionist workflow.",
  robots: { index: false, follow: false },
};

export default function PrototypePage() {
  return <PrototypeChat />;
}
