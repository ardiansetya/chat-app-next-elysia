"use client";

import { useState } from "react";
import { SendHorizontalIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";

const MAX = 2000;

export function MessageInput({ onSend }: { onSend: (content: string) => void }) {
  const [value, setValue] = useState("");
  const content = value.trim();

  function submit() {
    if (!content || content.length > MAX) return;
    onSend(content);
    setValue("");
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl p-3 pt-0"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          aria-label="Tulis pesan"
          placeholder="Tulis pesan…"
          rows={1}
          className="max-h-40 min-h-0"
          value={value}
          maxLength={MAX}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Enter kirim, Shift+Enter baris baru; abaikan Enter saat IME sedang menyusun kata.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <InputGroupAddon align="block-end">
          {value.length > MAX - 200 && (
            <InputGroupText>
              {value.length}/{MAX}
            </InputGroupText>
          )}
          <InputGroupButton
            type="submit"
            variant="default"
            size="icon-xs"
            className="ml-auto"
            disabled={!content}
            aria-label="Kirim"
          >
            <SendHorizontalIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
