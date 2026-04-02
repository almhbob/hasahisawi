import React from "react";
import { WhatsAppStatus } from "../WhatsAppStatus";

export default function Preview() {
  return (
    <div className="w-full h-screen bg-gray-900 flex items-center justify-center">
      <div style={{ width: "390px", height: "100vh", maxHeight: "844px", overflow: "hidden", position: "relative" }}>
        <WhatsAppStatus />
      </div>
    </div>
  );
}
