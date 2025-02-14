import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

type Bindings = {
  HONO_RABBIT_SCRAPER: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

export const customLogger = (message: string, ...rest: string[]) => {
  console.log(message, ...rest);
};

app.use(logger(customLogger));

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

const getRabbitMediaQuerySchema = z.object({
  mediaId: z.string(),
  seasonNum: z.string().optional(),
  epNum: z.string().optional(),
});

app.get(
  "/api/rabbit/fetch",
  zValidator("query", getRabbitMediaQuerySchema),
  async (c) => {
    const data = c.req.valid("query");
    const { epNum, seasonNum, mediaId } = data;
    const rabbitBaseURL = "https://api.vidjoy.pro/rabbit/fetch";

    const headers = new Headers();
    headers.append(
      "x-api-key",
      "441d9795370df358889abfd52bd499238f57a7ca8045a0056dd35a7beac6d9c7"
    );

    const reqOptions: RequestInit = {
      method: "GET",
      headers,
      redirect: "follow",
    };

    let fetchURL: string;

    if (seasonNum && epNum) {
      fetchURL = `${rabbitBaseURL}/${mediaId}?ss=${seasonNum}&ep=${epNum}`;
    } else {
      fetchURL = `${rabbitBaseURL}/${mediaId}`;
    }

    const kvKey = `${mediaId}/${seasonNum}/${epNum}`;

    const cached = await c.env.HONO_RABBIT_SCRAPER.get(kvKey);

    if (!cached) {
      try {
        customLogger("CACHE MISS");
        const streamLinKURL = await (await fetch(fetchURL, reqOptions)).json();
        await c.env.HONO_RABBIT_SCRAPER.put(
          kvKey,
          JSON.stringify(streamLinKURL),
          {
            expirationTtl: 1800,
          }
        );
        customLogger("RESPONSE CACHED!");
        return c.json(streamLinKURL as Record<string, any>);
      } catch (error) {
        return c.json(
          { error: "an error occured while scraping this media." },
          500
        );
      }
    }

    customLogger("CACHE HIT");
    return c.json(JSON.parse(cached));
  }
);

export default app;
