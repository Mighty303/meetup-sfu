import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    buckets: {
      "meetup-sfu-assets": { access: "private" },
    },
  },
});
