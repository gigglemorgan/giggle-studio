import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState, FriendlyError } from "../components/ui/StatusStates";
import { GiggleLogo } from "../components/GiggleLogo";

describe("UI Components", () => {
  it("renders EmptyState with title and description", () => {
    render(
      <EmptyState
        title="Henüz Sohbet Yok"
        description="Yeni bir sohbet başlatmak için tıklayın."
      />
    );
    expect(screen.getByText("Henüz Sohbet Yok")).toBeInTheDocument();
    expect(screen.getByText("Yeni bir sohbet başlatmak için tıklayın.")).toBeInTheDocument();
  });

  it("renders FriendlyError with message and fix hint", () => {
    render(
      <FriendlyError
        title="Bağlantı Hatası"
        message="Model sunucusuna ulaşılamadı."
        fixHint="giggle run komutunun çalıştığından emin olun."
      />
    );
    expect(screen.getByText("Bağlantı Hatası")).toBeInTheDocument();
    expect(screen.getByText("Model sunucusuna ulaşılamadı.")).toBeInTheDocument();
    expect(screen.getByText(/giggle run komutunun/)).toBeInTheDocument();
  });

  it("renders GiggleLogo with correct aria label", () => {
    render(<GiggleLogo size={32} />);
    expect(screen.getByLabelText("Giggle Studio Logo")).toBeInTheDocument();
  });
});
