import { Module } from '@nestjs/common';
import { AdminProfessorsController } from './admin-professors.controller';
import { AdminProfessorsService } from './admin-professors.service';
import { ProfessorsController } from './professors.controller';
import { ProfessorsService } from './professors.service';

@Module({
  controllers: [ProfessorsController, AdminProfessorsController],
  providers: [ProfessorsService, AdminProfessorsService],
})
export class ProfessorsModule {}
