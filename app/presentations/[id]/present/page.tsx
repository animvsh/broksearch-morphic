import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { getCurrentUserId } from "@/lib/auth/get-current-user";
import { getPresentationWithSlides } from "@/lib/db/actions/presentations";
import { getThemeById } from "@/lib/presentations/themes";
import { type SlideContent } from "@/lib/presentations/theme-utils";

// Dynamic import to avoid SSR hydration issues with fullscreen API
const PresentationMode = dynamic(
  () =>
    import("@/components/presentations/present/presentation-mode").then(
      (mod) => mod.PresentationMode
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    ),
  }
);

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

  const presentation = await getPresentationWithSlides(id, userId ?? undefined);

  if (!presentation) {
    notFound();
  }

  const theme = getThemeById(presentation.themeId ?? "minimal_light");
  if (!theme) {
    notFound();
  }

  const slides = transformSlides(presentation.slides);

  return (
    <PresentationMode
      slides={slides}
      theme={theme}
      presentationId={id}
    />
  );
}
