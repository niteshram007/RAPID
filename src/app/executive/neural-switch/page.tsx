import { ChatLayout } from "@/components/neuralswitch/chat/ChatLayout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExecutiveNeuralSwitchPage() {
  return <ChatLayout />;
}
