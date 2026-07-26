import { Request, Response } from "express";
import * as userService from "../../services/user.service";

/**
 * GET /api/users/:address
 * Returns user profile data for the given wallet address.
 */
export async function getUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;

    const user = await userService.getUserByAddress(address);

    if (!user) {
      res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user", code: "INTERNAL_ERROR" });
  }
}

/**
 * PUT /api/users/:address
 * Body: { displayName?, avatarUrl? }
 * Requires wallet-signature auth matching :address.
 */
export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;
    const { displayName, avatarUrl } = req.body;

    const user = await userService.updateUser(address, { displayName, avatarUrl });
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user", code: "INTERNAL_ERROR" });
  }
}
