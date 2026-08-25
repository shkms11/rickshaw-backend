import type { Request, Response } from "express";
import { PrismaClient, Role } from "../../generated/prisma/client.js";

const prisma = new PrismaClient();

export async function searchAdmin(req: Request, res: Response) {
  try {
    const query = String(req.query.q ?? "").trim();
    const type = String(req.query.type ?? "all").toLowerCase();

    if (!query) {
      return res.json({
        results: [],
        total: 0,
      });
    }

    // =========================
    // DRIVERS
    // =========================

    if (type === "drivers") {
      const drivers = await prisma.driver.findMany({
        where: {
          OR: [
            {
              licenseNo: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              user: {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            },
            {
              user: {
                email: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            },
          ],
        },

        select: {
          id: true,
          licenseNo: true,
          status: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },

        take: 20,
      });

      const results = drivers.map((driver) => ({
        id: driver.id,
        name: driver.user.name,
        type: "driver" as const,
        description: `${driver.user.email} • ${driver.licenseNo} • ${driver.status}`,
      }));

      return res.json({
        results,
        total: results.length,
      });
    }

    // =========================
    // OWNERS
    // =========================

    if (type === "owners") {
      const owners = await prisma.owner.findMany({
        where: {
          user: {
            OR: [
              {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            ],
          },
        },

        select: {
          id: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },

        take: 20,
      });

      const results = owners.map((owner) => ({
        id: owner.id,
        name: owner.user.name,
        type: "owner" as const,
        description: owner.user.email,
      }));

      return res.json({
        results,
        total: results.length,
      });
    }

    // =========================
    // LOCATIONS
    // =========================

    if (type === "location") {
      const trips = await prisma.trip.findMany({
        where: {
          OR: [
            {
              pickupLocation: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              dropoffLocation: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        },

        select: {
          id: true,
          pickupLocation: true,
          dropoffLocation: true,
        },

        take: 20,
      });

      const results = trips.map((trip) => ({
        id: trip.id,
        name: `${trip.pickupLocation} → ${trip.dropoffLocation}`,
        type: "location" as const,
        description: "Trip route",
      }));

      return res.json({
        results,
        total: results.length,
      });
    }

    // =========================
    // COMPLAINTS
    // =========================

    if (type === "complaints") {
      const complaints = await prisma.complaint.findMany({
        where: {
          OR: [
            {
              subject: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        },

        select: {
          id: true,
          subject: true,
          description: true,
          status: true,
        },

        take: 20,
      });

      const results = complaints.map((complaint) => ({
        id: complaint.id,
        name: complaint.subject,
        type: "complaint" as const,
        description: `${complaint.status} • ${complaint.description}`,
      }));

      return res.json({
        results,
        total: results.length,
      });
    }

    // =========================
    // ALL
    // =========================

    if (type === "all") {
      const [drivers, owners, trips, complaints] = await Promise.all([
        prisma.driver.findMany({
          where: {
            OR: [
              {
                licenseNo: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                user: {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
              {
                user: {
                  email: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
            ],
          },

          select: {
            id: true,
            licenseNo: true,
            status: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },

          take: 20,
        }),

        prisma.owner.findMany({
          where: {
            user: {
              OR: [
                {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
                {
                  email: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              ],
            },
          },

          select: {
            id: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },

          take: 20,
        }),

        prisma.trip.findMany({
          where: {
            OR: [
              {
                pickupLocation: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                dropoffLocation: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            ],
          },

          select: {
            id: true,
            pickupLocation: true,
            dropoffLocation: true,
          },

          take: 20,
        }),

        prisma.complaint.findMany({
          where: {
            OR: [
              {
                subject: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                description: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            ],
          },

          select: {
            id: true,
            subject: true,
            description: true,
            status: true,
          },

          take: 20,
        }),
      ]);

      const results = [
        ...drivers.map((driver) => ({
          id: driver.id,
          name: driver.user.name,
          type: "driver" as const,
          description: `${driver.user.email} • ${driver.licenseNo} • ${driver.status}`,
        })),

        ...owners.map((owner) => ({
          id: owner.id,
          name: owner.user.name,
          type: "owner" as const,
          description: owner.user.email,
        })),

        ...trips.map((trip) => ({
          id: trip.id,
          name: `${trip.pickupLocation} → ${trip.dropoffLocation}`,
          type: "location" as const,
          description: "Trip route",
        })),

        ...complaints.map((complaint) => ({
          id: complaint.id,
          name: complaint.subject,
          type: "complaint" as const,
          description: `${complaint.status} • ${complaint.description}`,
        })),
      ].slice(0, 50);

      return res.json({
        results,
        total: results.length,
      });
    }

    // =========================
    // INVALID TYPE
    // =========================

    return res.status(400).json({
      message:
        "Invalid search type. Use: all, drivers, owners, location, complaints.",
    });
  } catch (error) {
    console.error("Admin search error:", error);

    return res.status(500).json({
      message: "Failed to search admin data",
    });
  }
}
