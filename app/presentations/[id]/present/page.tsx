import { notFound } from "next/navigation";

import { getCurrentUserId } from "@/lib/auth/get-current-user";
import { getPresentationWithSlides } from "@/lib/db/actions/presentations";
import { type SlideContent } from "@/lib/presentations/theme-utils";
import { getThemeById } from "@/lib/presentations/themes";

import { PresentationModeWrapper } from "@/components/presentations/present/presentation-mode-wrapper";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Transform DB slide rows into SlideContent for the renderer
function transformSlides(
  dbSlides: Array<{
    id: string;
    layoutType: string;
    title: string;
    contentJson: Record<string, unknown>;
    speakerNotes: string | null;
  }>
): SlideContent[] {
  return dbSlides.map((slide) => {
    const content = slide.contentJson ?? {};
    const bullets = content.bullets as string[] | undefined;
    const body = content.body as
      | Array<{ type: string; content: string }>
      | undefined;

    return {
      id: slide.id,
      layout: slide.layoutType,
      heading: slide.title,
      body: body?.map((item) => ({
        type: item.type as "heading" | "body" | "bullet" | "caption",
        content: item.content,
      })),
      bullets,
      imageUrl: content.imageUrl as string | undefined,
      quote: content.quote as string | undefined,
      quoteAttribution: content.quoteAttribution as string | undefined,
      stats: content.stats as Array<{ label: string; value: string }> | undefined,
      speakerNotes: slide.speakerNotes ?? undefined,
    };
  });
}

export default async function PresentPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  // Try to get presentation - first with user ownership, then without (for public access)
  let presentation = await getPresentationWithSlides(id, userId ?? undefined);

  // If not found with user access, try without user (for public presentations)
  if (!presentation) {
    presentation = await getPresentationWithSlides(id, undefined);
  }

  if (!presentation) {
    notFound();
  }

  // Check if presentation is public - if not and user doesn't own it, deny access
  const isOwner = userId && presentation.userId === userId;
  if (!isOwner && !presentation.isPublic) {
    notFound();
  }

  const theme = getThemeById(presentation.themeId ?? "minimal_light");
  if (!theme) {
    notFound();
  }

  const slides = transformSlides(presentation.slides);

  if (slides.length === 0) {
    notFound();
  }

  return (
    <PresentationModeWrapper
      slides={slides}
      theme={theme}
      presentationId={id}
    />
  );
}
