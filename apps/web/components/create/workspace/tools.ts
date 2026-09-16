export const VIDEO_TOOLS = [
  { id: "affiliate", label: "Affiliate video", ready: true },
  { id: "image-to-video", label: "Image to video", ready: true },
  { id: "complete-set", label: "Complete set", ready: true },
  { id: "storyboard-to-video", label: "Storyboard to video", ready: false },
  { id: "edit-video", label: "Edit video", ready: false },
  { id: "clone-video", label: "Clone Video", ready: false },
  { id: "talking-video", label: "Talking video", ready: false },
  { id: "extend-video", label: "Extend video", ready: false },
  { id: "add-subtitles", label: "Add subtitles", ready: false },
] as const;

export const IMAGE_TOOLS = [
  { id: "generate-image", label: "Generate image", ready: true },
  { id: "edit-image", label: "Edit image", ready: true },
] as const;

export const WORKSPACE_I2V_ENGINES = ["minimax-h3", "wan-3-0-std", "wan-3-0"] as const;
