"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import Highlight from "@tiptap/extension-highlight"
import { Button } from "@/components/ui/button"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Undo2,
  Redo2,
} from "lucide-react"

interface RichTextEditorProps {
  content: string
  editable: boolean
  onChange?: (html: string) => void
}

export function RichTextEditor({ content, editable, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
    ],
    content: convertToHTML(content),
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

  if (!editor) return null

  return (
    <div className="border rounded-lg overflow-hidden">
      {editable && (
        <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/30">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>

          <div className="w-px bg-border mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>

          <div className="w-px bg-border mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            active={editor.isActive({ textAlign: "left" })}
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })}
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            active={editor.isActive({ textAlign: "right" })}
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>

          <div className="w-px bg-border mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive("highlight")}
          >
            <Highlighter className="h-4 w-4" />
          </ToolbarButton>

          <div className="w-px bg-border mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      <EditorContent
        editor={editor}
        className="prose max-w-none p-4 min-h-[300px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px]"
      />
    </div>
  )
}

function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-8 w-8 ${active ? "bg-muted" : ""}`}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/**
 * Convert plain text (with [VERIFY] and [PRACTITIONER JUDGMENT] markers)
 * to HTML for the editor, highlighting flagged items.
 */
function convertToHTML(text: string): string {
  if (!text) return "<p></p>"

  // If it already looks like HTML, return as-is
  if (text.startsWith("<")) return text

  return text
    .split("\n\n")
    .map((paragraph) => {
      let html = paragraph
        .replace(/\n/g, "<br>")
        .replace(
          /\[VERIFY\]/g,
          '<mark data-color="yellow" style="background-color: #fef3cd">[VERIFY]</mark>'
        )
        .replace(
          /\[PRACTITIONER JUDGMENT\]/g,
          '<mark data-color="blue" style="background-color: #cce5ff">[PRACTITIONER JUDGMENT]</mark>'
        )

      // Detect headers (lines ending with :, all caps, or starting with numbers)
      const trimmed = paragraph.trim()
      if (
        trimmed.match(/^\d+\.\s+[A-Z]/) ||
        trimmed === trimmed.toUpperCase() && trimmed.length < 60
      ) {
        return `<h3>${html}</h3>`
      }

      return `<p>${html}</p>`
    })
    .join("")
}
