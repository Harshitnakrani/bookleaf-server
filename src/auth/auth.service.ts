import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new user (default role: AUTHOR)
   */
  async register(registerDto: RegisterDto) {
    const { name, email, password, phone, city, authorId, role } = registerDto;

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already registered
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Check if authorId is specified and already taken
    if (authorId) {
      const existingAuthor = await this.prisma.user.findUnique({
        where: { authorId },
      });
      if (existingAuthor) {
        throw new ConflictException(`Author ID "${authorId}" is already registered`);
      }
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        authorId: authorId?.trim() || null,
        role: role || Role.AUTHOR,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        authorId: true,
        phone: true,
        city: true,
        isBankDetailsLinked: true,
        joinedDate: true,
        createdAt: true,
      },
    });

    const accessToken = this.generateToken(user);

    return {
      message: 'Account successfully registered',
      accessToken,
      user,
    };
  }

  /**
   * Log in an existing author or admin
   */
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const userProfile = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      authorId: user.authorId,
      phone: user.phone,
      city: user.city,
      isBankDetailsLinked: user.isBankDetailsLinked,
      joinedDate: user.joinedDate,
      createdAt: user.createdAt,
    };

    const accessToken = this.generateToken(user);

    return {
      message: 'Login successful',
      accessToken,
      user: userProfile,
    };
  }

  /**
   * Retrieve profile of current authenticated user
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        authorId: true,
        phone: true,
        city: true,
        isBankDetailsLinked: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankIfscCode: true,
        joinedDate: true,
        createdAt: true,
        _count: {
          select: {
            books: true,
            tickets: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }

  /**
   * List users with optional role filtering (for Admin portal)
   */
  async getUsers(role?: Role) {
    return this.prisma.user.findMany({
      where: role ? { role } : undefined,
      select: {
        id: true,
        authorId: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        role: true,
        isBankDetailsLinked: true,
        joinedDate: true,
        _count: {
          select: {
            books: true,
            tickets: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private generateToken(user: { id: string; email: string; role: Role; authorId?: string | null }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      authorId: user.authorId,
    };

    return this.jwtService.sign(payload);
  }
}
