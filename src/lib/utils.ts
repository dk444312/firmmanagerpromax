import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function safeJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {} as T;
  } catch (e) {
    console.error("JSON parse error:", text);
    return { error: "Invalid JSON response from server" } as any;
  }
}
