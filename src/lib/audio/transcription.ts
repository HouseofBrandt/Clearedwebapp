/**
 * Audio transcription service using OpenAI Whisper API.
 *
 * Sends audio files to OpenAI's transcription endpoint and returns
 * structured transcript data. Falls back gracefully when no API key
 * is configured.
 */

// ─── Types ──────────────────────────────────────────────────

export interface TranscriptionResult {
  text: string
  language: string
  duration: number
}

// ─── Supported audio MIME types ─────────────────────────────

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",        // .mp3
  "audio/mp4",         // .mp4, .m4a
  "audio/x-m4a",       // .m4a (alternative)
  "audio/mp4a-latm",   // .m4a (another alternative)
  "audio/wav",         // .wav
  "audio/x-wav",       // .wav (alternative)
  "audio/wave",        // .wav (alternative)
  "audio/webm",        // .webm
  "audio/ogg",         // .ogg
  "audio/flac",        // .flac
  "audio/x-flac",      // .flac (alternative)
])

const AUDIO_EXTENSIONS = new Set([
  "mp3", "mp4", "m4a", "wav", "webm", "ogg", "flac",
])

/**
 * Check whether a MIME type represents an audio file we can transcribe.
 */
export function isAudioMimeType(mime: string): boolean {
  const normalized = (mime || "").toLowerCase().split(";")[0].trim()
  return AUDIO_MIME_TYPES.has(normalized) || normalized.startsWith("audio/")
}

/**
 * Check whether a file extension represents an audio file we can transcribe.
 */
export function isAudioExtension(fileName: string): boolean {
  const ext = (fileName || "").toLowerCase().split(".").pop() || ""
  return AUDIO_EXTENSIONS.has(ext)
}

/**
 * Map file extension to a MIME type suitable for the Whisper API.
 */
function extensionToMime(fileName: string): string {
  const ext = (fileName || "").toLowerCase().split(".").pop() || ""
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "audio/webm",
    ogg: "audio/ogg",
    flac: "audio/flac",
  }
  return map[ext] || "audio/mpeg"
}

// ─── Main transcription function ────────────────────────────

/**
 * Transcribe an audio file buffer using OpenAI Whisper API.
 *
 * @param buffer - The raw audio file bytes
 * @param fileName - Original file name (used for extension detection)
 * @returns Transcription result with text, language, and duration
 * @throws Error if OPENAI_API_KEY is not configured or API call fails
 */
export async function transcribeAudio(
  buffer: Buffer,
  fileName: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Audio transcription is unavailable."
    )
  }

  const mime = extensionToMime(fileName)

  // Build multipart form data
  const formData = new FormData()
  const blob = new Blob([buffer], { type: mime })
  formData.append("file", blob, fileName)
  formData.append("model", "whisper-1")
  formData.append("response_format", "verbose_json")

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error")
    throw new Error(
      `Whisper API error (${response.status}): ${errorBody}`
    )
  }

  const data = await response.json()

  return {
    text: data.text || "",
    language: data.language || "en",
    duration: data.duration || 0,
  }
}

// ─── Availability check ─────────────────────────────────────

/**
 * Check whether the transcription service is available
 * (i.e., OPENAI_API_KEY is configured).
 */
export function isTranscriptionAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY
}
