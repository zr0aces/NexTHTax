import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../../src/App";

vi.mock("virtual:pwa-register", () => ({
  registerSW: () => () => Promise.resolve(),
}));

describe("App entry", () => {
  it("shows the Thai entry screen with no login and a backup reminder", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "NexTHTax เอกสารภาษีบนเครื่อง" })).toBeInTheDocument();
    expect(screen.getByText(/ไม่ต้องสมัครสมาชิก/)).toBeInTheDocument();
    expect(screen.getByText(/โปรดสำรองข้อมูล/)).toBeInTheDocument();
  });

  it("explains the unsupported browser and disables folder actions when the picker is absent", async () => {
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Chrome หรือ Edge");
    expect(screen.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" })).toBeDisabled();
  });
});
