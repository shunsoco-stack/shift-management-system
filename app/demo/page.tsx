import { DemoApp } from "@/src/components/demo/demo-shell";
import { ShiftProvider } from "@/src/lib/shift-context";
import "@/src/styles/demo.css";

export default function DemoPage() {
  return (
    <ShiftProvider>
      <DemoApp />
    </ShiftProvider>
  );
}
