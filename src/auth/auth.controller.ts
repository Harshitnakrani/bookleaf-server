import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new author account
   */
  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register Author Account',
    description: 'Registers a new author with password hashing and returns JWT auth session',
  })
  @ApiResponse({ status: 201, description: 'Author registered successfully with accessToken' })
  @ApiResponse({ status: 400, description: 'Validation failure or email already in use' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * Author or Admin login
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate User (Login)',
    description: 'Validates email & password, returning JWT access token and user role metadata',
  })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid email or password credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * Get current authenticated user profile
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({
    summary: 'Get Current Authenticated Profile',
    description: 'Returns profile details, linked books count, and role of the currently logged-in user',
  })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Missing or expired Bearer JWT token' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  /**
   * Admin-only endpoint: List users with optional role filtering
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('users')
  @ApiOperation({
    summary: 'List Registered Users (Admin)',
    description: 'Retrieves all registered authors and ops staff, filterable by role',
  })
  @ApiQuery({ name: 'role', enum: Role, required: false, description: 'Filter by role: AUTHOR or ADMIN' })
  @ApiResponse({ status: 200, description: 'List of users retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden: Requires ADMIN role' })
  async getUsers(@Query('role') role?: Role) {
    return this.authService.getUsers(role);
  }
}
